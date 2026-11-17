/**
 * Adapters over the AI agents that live in the sibling Prod-error-AI-agent repo.
 * The agents, prompt files, schemas and AI provider are loaded from that repo at runtime (not copied),
 * so prompt or agent changes there apply here automatically.
 *
 *   bug title   -> prompts/Bug-Title-generator-prompt.md       (same call as analyze-skypad-errors.ts)
 *   test cases  -> TestCaseGeneratorService + testcase-generator-prompt.md (10 cases, zod-validated)
 *   bug story   -> BugStoryWriterAgent (description + exactly 5 acceptance criteria)
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BugStory, ErrorCluster, Severity, TestCase } from '../src/app/models';
import { AGENT_REPO, AI_RETRIES, AI_TIMEOUT_MS, aiConfigured } from './config';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
interface Provider {
  chat(messages: ChatMessage[]): Promise<string>;
}
interface GeneratedTestCase {
  testCaseId: string;
  scenario: string;
  testSteps: string;
  expectedResult: string;
  priority: 'High' | 'Medium' | 'Low';
}
interface BugInput {
  id: string;
  bugTitle: string;
  [k: string]: unknown;
}
interface Kit {
  provider: Provider;
  generator: {
    toBugInput(entry: Record<string, unknown>): BugInput;
    buildSystemPrompt(template: string, bug: BugInput): string;
    generateTestCases(systemPrompt: string, bug: BugInput): Promise<GeneratedTestCase[]>;
  };
  storyAgent: {
    generate(failure: unknown): Promise<{ descriptionMarkdown: string; acceptanceCriteriaMarkdown: string }>;
  };
  testCaseTemplate: string;
  titlePrompt: string;
}

export class AiUnavailableError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Adds a per-call timeout and retries with backoff on transient failures (HTTP 5xx, 429, network errors).
 * Patches the provider instance only, so the agent repo's code is untouched; 4xx errors are not retried.
 */
function withResilience(p: Provider): Provider {
  const original = p.chat.bind(p);
  p.chat = async (messages) => {
    for (let attempt = 0; ; attempt++) {
      try {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, rej) => {
          timer = setTimeout(() => rej(new Error(`AI request timed out after ${AI_TIMEOUT_MS / 1000}s`)), AI_TIMEOUT_MS);
        });
        try {
          return await Promise.race([original(messages), timeout]);
        } finally {
          clearTimeout(timer);
        }
      } catch (e) {
        const msg = String((e as Error).message);
        const status = Number(/Status:\s*(\d{3})/.exec(msg)?.[1] ?? 0);
        const transient =
          status >= 500 || status === 429 || (status === 0 && /timed out|fetch failed|ECONN|ETIMEDOUT|socket|terminated/i.test(msg));
        if (!transient || attempt >= AI_RETRIES) throw e;
        const wait = 2000 * 2 ** attempt + Math.random() * 500;
        console.warn(`[ai] transient failure (${status || 'network/timeout'}), retry ${attempt + 1}/${AI_RETRIES} in ${Math.round(wait)}ms`);
        await sleep(wait);
      }
    }
  };
  return p;
}

async function loadExport<T>(relativeFile: string, name: string): Promise<T> {
  const mod = (await import(pathToFileURL(path.join(AGENT_REPO, relativeFile)).href)) as Record<string, any>;
  const value = mod[name] ?? mod['default']?.[name];
  if (!value) throw new Error(`Export "${name}" not found in ${relativeFile}. Check AGENT_REPO_PATH.`);
  return value as T;
}

let kitPromise: Promise<Kit> | undefined;

/** Lazily wires the agents exactly like packages/testcase-generator/scripts/generate-test-cases.ts does. */
export function getKit(): Promise<Kit> {
  if (!aiConfigured()) {
    return Promise.reject(
      new AiUnavailableError('AI is not configured. Set API_URL, API_KEY and MODEL_NAME (see README).'),
    );
  }
  kitPromise ??= (async (): Promise<Kit> => {
    const AIProvider = await loadExport<new () => Provider>('packages/ai/providers/AIProvider.ts', 'AIProvider');
    const StoryProvider = await loadExport<new () => Provider>(
      'packages/bug-story-writer/src/providers/AIProvider.ts',
      'AIProvider',
    );
    const Structured = await loadExport<new () => unknown>(
      'packages/ai/services/structured-response.service.ts',
      'StructuredResponseService',
    );
    const Generator = await loadExport<new (p: Provider, s: unknown) => Kit['generator']>(
      'packages/testcase-generator/src/services/testcase-generator.service.ts',
      'TestCaseGeneratorService',
    );
    const StoryAgent = await loadExport<new (p: Provider) => Kit['storyAgent']>(
      'packages/bug-story-writer/src/agents/BugStoryWriterAgent.ts',
      'BugStoryWriterAgent',
    );
    const provider = withResilience(new AIProvider());
    return {
      provider,
      generator: new Generator(provider, new Structured()),
      storyAgent: new StoryAgent(withResilience(new StoryProvider())),
      testCaseTemplate: await readFile(path.join(AGENT_REPO, 'prompts', 'testcase-generator-prompt.md'), 'utf-8'),
      titlePrompt: (await readFile(path.join(AGENT_REPO, 'prompts', 'Bug-Title-generator-prompt.md'), 'utf-8')).trim(),
    };
  })().catch((e) => {
    kitPromise = undefined; // allow a retry after the config is fixed
    throw e;
  });
  return kitPromise;
}

// ---------------------------------------------------------------- cluster -> agent input

/** Fields the agents expect, taken from the cluster's first sample log (same shape as the Skypad error report). */
function agentEntry(c: ErrorCluster): Record<string, unknown> {
  const s = c.samples[0];
  return {
    id: c.id,
    bugTitle: c.bugTitle,
    appName: s?.appName,
    service: s?.service ?? s?.module,
    context: s?.context,
    url: s?.url,
    statusCode: s?.statusCode,
    message: s?.message,
    error: s?.error ?? s?.stackTrace,
  };
}

const MAX_TITLE = 120;
const clip = (t: string) => (t.length > MAX_TITLE ? t.slice(0, MAX_TITLE - 3).trimEnd() + '...' : t);

// -------------------------------------------------------------------------- bug title

/** Identical to generateBugTitle() in analyze-skypad-errors.ts: payload, prompt, first line only, <=120 chars. */
export async function generateBugTitle(c: ErrorCluster): Promise<string> {
  const kit = await getKit();
  const e = agentEntry(c);
  const payload = {
    appName: e['appName'] ?? null,
    context: e['context'] ?? null,
    url: e['url'] ?? null,
    message: e['message'] ?? null,
    error: e['error'] ?? null,
  };
  const raw = await kit.provider.chat([
    { role: 'system', content: kit.titlePrompt },
    { role: 'user', content: `Input error log (JSON):\n\n${JSON.stringify(payload, null, 2)}` },
  ]);
  const title = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] ?? '';
  if (!title) throw new Error('AI returned an empty bug title.');
  return clip(title);
}

// ------------------------------------------------------------------------- test cases

/** Runs the agent repo's TestCaseGeneratorService. Calling it again for a cluster is the "regeneration" flow. */
export async function generateTestCases(c: ErrorCluster): Promise<TestCase[]> {
  const kit = await getKit();
  const bug = kit.generator.toBugInput(agentEntry(c));
  const system = kit.generator.buildSystemPrompt(kit.testCaseTemplate, bug);
  let rows: GeneratedTestCase[];
  try {
    rows = await kit.generator.generateTestCases(system, bug);
  } catch (first) {
    // The model occasionally returns malformed JSON; one retry matches how the script is normally re-run.
    if (!/invalid JSON|schema validation/i.test(String((first as Error).message))) throw first;
    rows = await kit.generator.generateTestCases(system, bug);
  }
  const s = c.samples[0];
  const where = [s?.appName, s?.service ?? s?.module].filter(Boolean).join(' / ');
  return rows.map((r) => ({
    id: r.testCaseId,
    clusterId: c.id,
    scenario: r.scenario,
    // The agent prompt has no preconditions field, so these are derived from the bug context.
    preconditions: [where && `${where} is deployed and reachable`, s?.url && `Endpoint ${s.url} is available`].filter(
      (x): x is string => !!x,
    ),
    steps: r.testSteps.split(/\r?\n/).map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean),
    expectedResults: [r.expectedResult],
    priority: r.priority,
  }));
}

// -------------------------------------------------------------------------- bug story

/** Mirrors DynatraceReportReader's mapping of a Skypad error to a DynatraceFailure. */
function toFailure(c: ErrorCluster) {
  const s = c.samples[0];
  return {
    categoryId: String(s?.appName ?? 'SKYPAD'),
    categoryTitle: String(s?.context ?? s?.service ?? 'Skypad error'),
    severity: String(s?.level ?? 'error'),
    suggestedBug: c.bugTitle,
    event: {
      timestamp: String(s?.timestamp ?? ''),
      service: String(s?.service ?? s?.module ?? ''),
      traceId: String(s?.correlationId ?? ''),
      message: String(s?.message ?? ''),
      stackTrace: s?.error ?? s?.stackTrace,
      attributes: { url: s?.url, context: s?.context, appName: s?.appName },
    },
  };
}

export async function generateBugStory(c: ErrorCluster): Promise<BugStory> {
  const kit = await getKit();
  const ai = await kit.storyAgent.generate(toFailure(c));
  // The agent returns placeholder text instead of throwing when the model output is unusable.
  if (/^Unable to generate AI description\.?$/i.test(ai.descriptionMarkdown.trim()) || /Generation failed/i.test(ai.acceptanceCriteriaMarkdown)) {
    throw new Error('The AI response could not be parsed into a bug story. Please try again.');
  }
  const now = new Date().toISOString();
  return {
    id: `BUG-${c.id.replace('CL-', '')}`,
    clusterId: c.id,
    title: c.bugTitle,
    description: ai.descriptionMarkdown.trim(),
    // The agent does not write these two sections; they come from the cluster analysis.
    rootCause: c.rootCause,
    businessImpact: c.businessImpact,
    acceptanceCriteria: ai.acceptanceCriteriaMarkdown
      .split(/\r?\n/)
      .map((l) => /^AC(\d+)\s*:\s*(.+)$/i.exec(l.trim()))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ id: `AC${m[1]}`, description: m[2].trim() })),
    severity: c.severity as Severity,
    createdAt: now,
    updatedAt: now,
  };
}

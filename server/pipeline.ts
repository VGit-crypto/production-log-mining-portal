import { createHash } from 'node:crypto';
import { BugStory, ErrorCluster, LogEntry, PipelineStatus, TestCase, UploadResult } from '../src/app/models';
import { analyzeCluster, clusterErrors, isErrorRecord, mergeDraft, parseLogContent } from '../src/app/core/mock/log-pipeline';
import { AiUnavailableError, generateBugStory, generateBugTitle, generateTestCases } from './agents';
import { AI_CONCURRENCY, aiConfigured } from './config';
import { Store } from './store';

const asCluster = (c: Omit<ErrorCluster, 'relatedBugIds' | 'testCaseIds'>): ErrorCluster => ({
  ...c,
  relatedBugIds: [],
  testCaseIds: [],
});

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Maps AI failures to a clean 502/503 without leaking provider internals. */
export function toHttpError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof AiUnavailableError) return new HttpError(503, e.message);
  const msg = e instanceof Error ? e.message : String(e);
  return new HttpError(502, `AI request failed: ${msg.replace(/\s+/g, ' ').slice(0, 300)}`);
}

/** Single-line, bounded error text that keeps the HTTP status (never includes request headers or keys). */
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 400);

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

export class Pipeline {
  private readonly queue: string[] = [];
  private active = 0;
  private readonly failed = new Map<string, string>();

  constructor(private readonly store: Store) {}

  status(): PipelineStatus {
    const last = [...this.failed.values()].pop();
    return {
      pendingClusters: this.queue.length + this.active,
      failedClusters: this.failed.size,
      lastError: last ? oneLine(last).slice(0, 220) : undefined,
    };
  }

  /** Picks up clusters that never got test cases (e.g. the server restarted mid-generation). */
  resumePending(): void {
    if (!aiConfigured()) return;
    this.store
      .listClusters()
      .filter((c) => c.testCaseIds.length === 0)
      .forEach((c) => this.enqueue(c.id));
  }

  /**
   * Steps 1-9 of the flow: parse -> extract errors -> normalize -> cluster -> AI bug titles ->
   * store -> queue AI test-case generation. Test cases are produced in the background because
   * the agent makes one long AI call per cluster.
   */
  async ingest(text: string, fileName: string, mode: 'normal' | 'backfill' = 'normal'): Promise<UploadResult> {
    let entries;
    try {
      entries = parseLogContent(text, fileName);
    } catch (e) {
      throw new HttpError(422, `Unable to parse ${fileName}: ${(e as Error).message}`);
    }
    const errors = entries.filter(isErrorRecord);
    const drafts = clusterErrors(errors);
    const hash = createHash('sha256').update(text).digest('hex');
    const base = {
      uploadId: `UP-${Date.now().toString(36).toUpperCase()}`,
      fileName,
      totalRecords: entries.length,
      errorRecords: errors.length,
      clustersCreated: 0,
      clustersUpdated: 0,
      testCasesGenerated: 0,
      testCasesQueued: 0,
    };

    if (mode === 'backfill') return { ...base, ...this.backfill(drafts, hash, fileName) };
    if (this.store.hasFile(hash)) {
      return { ...base, warnings: ['This exact file was already processed, so nothing was changed or counted twice.'] };
    }

    // A record already stored for the cluster (same timestamp, correlation id, message and error) is not counted
    // again, so overlapping uploads do not inflate frequencies. Duplicates inside one file are all counted.
    const warnings: string[] = [];
    const isNew = new Set<string>();
    const analyzed: ErrorCluster[] = [];
    const freshByCluster = new Map<string, LogEntry[]>();
    for (const draft of drafts) {
      const prev = this.store.rawCluster(draft.id);
      const fresh = this.store.freshRecords(draft.id, draft.records);
      if (!fresh.length) continue; // nothing new for this cluster
      freshByCluster.set(draft.id, fresh);
      draft.occurrences = fresh.length;
      draft.fatalCount = fresh.filter((r) => r.level === 'FATAL').length;
      if (prev) mergeDraft(draft, prev);
      else isNew.add(draft.id);
      const a = asCluster(analyzeCluster(draft));
      if (prev) a.bugTitle = prev.bugTitle; // keep the title the AI already wrote for this cluster
      analyzed.push(a);
    }
    if (!analyzed.length) warnings.push('No new error records were found; every record in this file is already stored.');

    // AI bug titles for new clusters (same prompt/payload as analyze-skypad-errors.ts).
    const fresh = analyzed.filter((c) => isNew.has(c.id));
    if (fresh.length && !aiConfigured()) {
      warnings.push('AI is not configured (API_URL, API_KEY, MODEL_NAME): rule-based bug titles were used and test cases were not generated.');
    } else {
      let failures = 0;
      await mapLimit(fresh, AI_CONCURRENCY, async (c) => {
        try {
          c.bugTitle = await generateBugTitle(c);
        } catch (e) {
          failures++;
          console.error(`[ai] bug title failed for ${c.id}: ${oneLine((e as Error).message)}`);
        }
      });
      if (failures) warnings.push(`AI bug title failed for ${failures} cluster(s); rule-based titles were used.`);
    }

    this.store.batch(() => {
      for (const c of analyzed) {
        const { relatedBugIds: _a, testCaseIds: _b, ...stored } = c;
        this.store.putCluster(stored);
        this.store.addOccurrences(c.id, freshByCluster.get(c.id)!);
      }
      const freshTimestamps = [...freshByCluster.values()].flat().map((r) => r.timestamp);
      this.store.addTotals(entries.length, freshTimestamps);
      this.store.markFile(hash, fileName);
    });

    let queued = 0;
    if (aiConfigured()) {
      for (const c of analyzed) {
        if (isNew.has(c.id) && this.enqueue(c.id)) queued++;
      }
    }
    return {
      ...base,
      clustersCreated: isNew.size,
      clustersUpdated: analyzed.length - isNew.size,
      testCasesQueued: queued,
      warnings: warnings.length ? warnings : undefined,
    };
  }

  /**
   * Attaches the individual occurrence records of a log file to clusters that already exist, without changing any
   * count, title, test case or total. Used for data stored before every occurrence was kept.
   */
  private backfill(
    drafts: ReturnType<typeof clusterErrors>,
    hash: string,
    fileName: string,
  ): Pick<UploadResult, 'clustersUpdated' | 'occurrencesStored' | 'warnings'> {
    let matched = 0;
    let stored = 0;
    let unmatched = 0;
    const mismatched: string[] = [];
    this.store.batch(() => {
      for (const d of drafts) {
        const prev = this.store.rawCluster(d.id);
        if (!prev) {
          unmatched++;
          continue;
        }
        stored += this.store.addOccurrences(d.id, d.records).length;
        matched++;
        if (this.store.occurrenceCount(d.id) !== prev.occurrences) mismatched.push(d.id);
      }
      this.store.markFile(hash, fileName);
    });
    const warnings: string[] = [];
    if (unmatched) warnings.push(`${unmatched} group(s) in the file have no matching cluster and were ignored.`);
    if (mismatched.length) {
      warnings.push(
        `${mismatched.length} cluster(s) now hold a different number of records than their counted frequency (${mismatched.slice(0, 5).join(', ')}${mismatched.length > 5 ? ', …' : ''}). The file probably differs from the one originally uploaded.`,
      );
    }
    return { clustersUpdated: matched, occurrencesStored: stored, warnings: warnings.length ? warnings : undefined };
  }

  /** "Generate / Regenerate Test Cases" button: synchronous, replaces the cluster's existing test cases. */
  async regenerateTests(clusterId: string): Promise<TestCase[]> {
    const cluster = this.require(clusterId);
    try {
      const tests = await generateTestCases(cluster);
      this.store.replaceTests(clusterId, tests);
      this.failed.delete(clusterId);
      return tests;
    } catch (e) {
      throw toHttpError(e);
    }
  }

  async createBugStory(clusterId: string, force: boolean): Promise<BugStory> {
    const cluster = this.require(clusterId);
    const existing = this.store.getBug(`BUG-${clusterId.replace('CL-', '')}`);
    if (existing && !force) return existing;
    try {
      const story = await generateBugStory(cluster);
      this.store.putBug(story);
      return story;
    } catch (e) {
      throw toHttpError(e);
    }
  }

  private require(id: string): ErrorCluster {
    const c = this.store.getCluster(id);
    if (!c) throw new HttpError(404, `Cluster ${id} not found`);
    return c;
  }

  private enqueue(id: string): boolean {
    if (this.queue.includes(id)) return false;
    this.queue.push(id);
    this.pump();
    return true;
  }

  private pump(): void {
    while (this.active < AI_CONCURRENCY && this.queue.length) {
      const id = this.queue.shift()!;
      this.active++;
      void this.regenerateTests(id)
        .catch((e: Error) => {
          this.failed.set(id, e.message);
          console.error(`[ai] test-case generation failed for ${id}: ${oneLine(e.message)}`);
        })
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }
}

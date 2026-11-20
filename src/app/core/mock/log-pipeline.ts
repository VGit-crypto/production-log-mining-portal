/**
 * Pure functions implementing the log-mining pipeline:
 *   parse -> extract errors -> normalize -> cluster -> analyze -> generate tests / bug story.
 *
 * In production this logic lives in the backend, and `analyzeCluster` is replaced by an Azure OpenAI
 * call. The heuristics here mirror the shape of that response so the UI behaves identically with the
 * mock API (environment.useMockApi) and with the real one.
 */
import {
  AcceptanceCriteria,
  BugStory,
  DashboardMetrics,
  ErrorCluster,
  GroupBasis,
  LogEntry,
  LogLevel,
  OccurrencePage,
  OccurrenceQuery,
  SEVERITIES,
  Severity,
  TestCase,
} from '../../models';

const MAX_SAMPLES = 5;
const MAX_STACK_CHARS = 2000;

// ---------------------------------------------------------------- 1-2. Parse

type Raw = Record<string, unknown>;

export function parseLogContent(text: string, fileName: string): LogEntry[] {
  const lower = fileName.toLowerCase();
  let records: unknown[];
  if (lower.endsWith('.ndjson')) {
    records = text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
  } else {
    const parsed: unknown = JSON.parse(text);
    records = Array.isArray(parsed) ? parsed : extractArray(parsed) ?? [parsed];
  }
  return records.filter((r): r is Raw => !!r && typeof r === 'object').map(toLogEntry);
}

function extractArray(obj: unknown): unknown[] | null {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of ['logs', 'records', 'entries', 'events', 'items', 'data']) {
    const v = (obj as Raw)[key];
    if (Array.isArray(v)) return v;
  }
  return null;
}

function pick(o: Raw, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

function str(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const m = (v as Raw)['message'];
    return typeof m === 'string' ? m : JSON.stringify(v);
  }
  return String(v);
}

function normalizeLevel(v: unknown): LogLevel {
  const l = str(v).toUpperCase();
  if (l.startsWith('WARN')) return 'WARN';
  if (l === 'CRITICAL' || l === 'EMERGENCY' || l === 'ALERT') return 'FATAL';
  if (l === 'ERR' || l === 'SEVERE') return 'ERROR';
  return (['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'].includes(l) ? l : 'INFO') as LogLevel;
}

let seq = 0;
function toLogEntry(o: Raw): LogEntry {
  const exc = pick(o, ['exception', 'error']);
  const excObj = exc && typeof exc === 'object' ? (exc as Raw) : undefined;
  const message = str(pick(o, ['message', 'msg', 'text'])) || str(exc);
  const stack = str(pick(o, ['stackTrace', 'stack_trace', 'stack']) ?? excObj?.['stack'] ?? excObj?.['stackTrace']);
  const explicitType = str(pick(o, ['exceptionType', 'exception_type', 'errorType', 'exceptionClass']) ?? excObj?.['type']);
  const errorStr = typeof o['error'] === 'string' && o['error'].trim() ? o['error'].trim().slice(0, MAX_STACK_CHARS) : undefined;
  const http = o['http'] && typeof o['http'] === 'object' ? (o['http'] as Raw) : undefined;
  const inferred = /([A-Za-z_$][\w.$]*(?:Exception|Error))/.exec(`${message}\n${stack}\n${errorStr ?? ''}`)?.[1];
  const ts = str(pick(o, ['timestamp', '@timestamp', 'time', 'ts', 'datetime']));
  const parsedTs = ts && !Number.isNaN(Date.parse(ts)) ? new Date(ts).toISOString() : new Date().toISOString();

  return {
    id: str(pick(o, ['id', 'logId'])) || `log-${++seq}`,
    timestamp: parsedTs,
    level: normalizeLevel(pick(o, ['level', 'severity', 'lvl', 'logLevel'])),
    message,
    module: str(pick(o, ['module', 'service', 'logger', 'component', 'appName', 'app'])) || 'unknown',
    exceptionType: explicitType || inferred || undefined,
    stackTrace: stack ? stack.slice(0, MAX_STACK_CHARS) : undefined,
    correlationId: str(pick(o, ['correlationId', 'x-correlation-id', 'traceId', 'requestId'])) || undefined,
    appName: str(pick(o, ['appName', 'app_name'])) || undefined,
    service: str(o['service']) || undefined,
    context: str(o['context']) || undefined,
    url: str(http?.['url'] ?? o['url']) || undefined,
    statusCode: toNumber(http?.['statusCode'] ?? o['statusCode']),
    error: errorStr,
    method: str(http?.['method'] ?? o['method']) || undefined,
    phase: str(o['phase']) || undefined,
    environment: str(pick(o, ['environment', 'env'])) || undefined,
  };
}

function toNumber(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

// ------------------------------------------------------- 3. Extract errors

export function isErrorRecord(e: LogEntry): boolean {
  return (
    e.level === 'ERROR' ||
    e.level === 'FATAL' ||
    !!e.error || // same rule as the agent repo: level=error OR an `error` field is present
    /exception/i.test(`${e.message} ${e.exceptionType ?? ''} ${e.stackTrace ?? ''}`)
  );
}

// ------------------------------------------------------------ 4. Normalize

const NORMALIZERS: [RegExp, string][] = [
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>'],
  [/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<TS>'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<EMAIL>'],
  [/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '<IP>'],
  [/\b0x[0-9a-f]+\b/gi, '<HEX>'],
  [/\?[^\s"')]+/g, '?<QUERY>'],
  [/"[^"]{1,80}"|'[^']{1,80}'/g, '<STR>'],
  // No word boundaries: digits glued to units or identifiers ("20000ms", "user42") must collapse too.
  [/\d+(?:\.\d+)?/g, '<N>'],
];

export function normalizeMessage(e: LogEntry): string {
  let t = `${e.exceptionType ? e.exceptionType + ': ' : ''}${e.message}`;
  for (const [re, rep] of NORMALIZERS) t = t.replace(re, rep);
  return t.replace(/\s+/g, ' ').trim().slice(0, 200);
}

// ------------------------------------------------------------- 5. Cluster

export interface ClusterDraft {
  id: string;
  groupBasis: GroupBasis;
  groupKey: string;
  signature: string;
  module: string;
  occurrences: number;
  fatalCount: number;
  firstSeen: string;
  lastSeen: string;
  samples: LogEntry[];
  /** Every error record in this group (the individual occurrences behind `occurrences`). */
  records: LogEntry[];
  hasStack: boolean;
  hasType: boolean;
}

/** Upper bound of occurrence records kept per cluster (frequency counts are never capped). */
export const MAX_OCCURRENCES_PER_CLUSTER = 5000;

/** Identity of a log record, used to avoid storing the same record twice across overlapping uploads. */
export function entryKey(e: LogEntry): string {
  return hash(`${e.timestamp}|${e.correlationId ?? ''}|${e.message}|${e.error ?? e.stackTrace ?? ''}`);
}

const LEVEL_RANK: Record<LogLevel, number> = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, FATAL: 5 };

/** Filter, sort and paginate occurrence records (shared by the server and the in-browser mock). */
export function queryOccurrences(all: LogEntry[], q: OccurrenceQuery): OccurrencePage {
  const needle = q.q.trim().toLowerCase();
  const rows = needle
    ? all.filter((e) =>
        `${e.message} ${e.error ?? ''} ${e.stackTrace ?? ''} ${e.correlationId ?? ''} ${e.url ?? ''} ${e.context ?? ''}`
          .toLowerCase()
          .includes(needle),
      )
    : [...all];
  const dir = q.dir === 'asc' ? 1 : -1;
  const value = (e: LogEntry): string | number => {
    switch (q.sort) {
      case 'level': return LEVEL_RANK[e.level];
      case 'statusCode': return e.statusCode ?? -1;
      case 'phase': return e.phase ?? '';
      case 'message': return e.message;
      case 'correlationId': return e.correlationId ?? '';
      default: return e.timestamp;
    }
  };
  rows.sort((a, b) => {
    const x = value(a);
    const y = value(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  const pageSize = Math.min(200, Math.max(1, Math.floor(q.pageSize) || 25));
  const page = Math.max(0, Math.floor(q.page) || 0);
  return { items: rows.slice(page * pageSize, (page + 1) * pageSize), total: rows.length, page, pageSize, stored: all.length };
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
}

export function clusterErrors(errors: LogEntry[]): ClusterDraft[] {
  const map = new Map<string, ClusterDraft>();
  for (const e of errors) {
    const signature = normalizeMessage(e);
    // Same grouping rule as the agent repo (analyze-skypad-errors): one group per context + url.
    // Logs without both fields fall back to module + normalized signature.
    const byContextUrl = !!(e.context && e.url);
    const key = byContextUrl ? `${e.context}|||${e.url}` : `${e.module}|${signature}`;
    let c = map.get(key);
    if (!c) {
      c = {
        id: `CL-${hash(key)}`,
        groupBasis: byContextUrl ? 'context+url' : 'module+signature',
        groupKey: byContextUrl ? `${e.context} | ${e.url}` : `${e.module} | ${signature}`,
        signature,
        module: e.module,
        occurrences: 0,
        fatalCount: 0,
        firstSeen: e.timestamp,
        lastSeen: e.timestamp,
        samples: [],
        records: [],
        hasStack: false,
        hasType: false,
      };
      map.set(key, c);
    }
    c.records.push(e);
    c.occurrences++;
    if (e.level === 'FATAL') c.fatalCount++;
    if (e.timestamp < c.firstSeen) c.firstSeen = e.timestamp;
    if (e.timestamp > c.lastSeen) c.lastSeen = e.timestamp;
    c.hasStack ||= !!e.stackTrace;
    c.hasType ||= !!e.exceptionType;
    if (c.samples.length < MAX_SAMPLES) c.samples.push(e);
  }
  return [...map.values()];
}

/**
 * appName / service / context / grouping info for a stored cluster. Clusters stored before these fields existed
 * get them derived from their first sample log (the log that created the cluster), so no re-upload is needed.
 */
export function locationInfo(
  c: Pick<ErrorCluster, 'module' | 'signature' | 'appName' | 'service' | 'context' | 'groupBasis' | 'groupKey'> & {
    samples: LogEntry[];
  },
): Pick<ErrorCluster, 'appName' | 'service' | 'context' | 'groupBasis' | 'groupKey'> {
  const s = c.samples[0];
  const byContextUrl = !!(s?.context && s?.url);
  return {
    appName: c.appName ?? s?.appName,
    service: c.service ?? s?.service,
    context: c.context ?? s?.context,
    groupBasis: c.groupBasis ?? (byContextUrl ? 'context+url' : 'module+signature'),
    groupKey: c.groupKey ?? (byContextUrl ? `${s.context} | ${s.url}` : `${c.module} | ${c.signature}`),
  };
}

/** Folds a previously stored cluster into a freshly built draft (re-upload of overlapping logs). */
export function mergeDraft(
  draft: ClusterDraft,
  prev: { occurrences: number; fatalCount: number; firstSeen: string; lastSeen: string; samples: LogEntry[] },
): void {
  draft.occurrences += prev.occurrences;
  draft.fatalCount += prev.fatalCount;
  draft.firstSeen = prev.firstSeen < draft.firstSeen ? prev.firstSeen : draft.firstSeen;
  draft.lastSeen = prev.lastSeen > draft.lastSeen ? prev.lastSeen : draft.lastSeen;
  draft.samples = [...prev.samples, ...draft.samples].slice(0, MAX_SAMPLES);
  draft.hasStack = true;
  draft.hasType = true;
}

export function buildMetrics(
  clusters: Pick<ErrorCluster, 'severity' | 'module' | 'occurrences'>[],
  totals: { totalLogs: number; totalErrors: number; timeline: Record<string, number> },
): DashboardMetrics {
  const count = (s: Severity) => clusters.filter((c) => c.severity === s).length;
  const byModule = new Map<string, number>();
  clusters.forEach((c) => byModule.set(c.module, (byModule.get(c.module) ?? 0) + c.occurrences));
  const trend = Object.entries(totals.timeline)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));
  return {
    totalLogs: totals.totalLogs,
    totalErrors: totals.totalErrors,
    uniqueClusters: clusters.length,
    critical: count('Critical'),
    high: count('High'),
    medium: count('Medium'),
    low: count('Low'),
    // Errors (occurrences) per severity; the critical/high/... counts above are clusters.
    bySeverity: SEVERITIES.map((label) => ({
      label,
      value: clusters.filter((c) => c.severity === label).reduce((n, c) => n + c.occurrences, 0),
    })),
    byModule: [...byModule]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    trend: trend.slice(-30),
  };
}

// --------------------------------- 6-7. Analyze (rule-based; the server layers the AI agents on top)

interface Rule {
  category: string;
  match: RegExp;
  title: (m: string) => string;
  rca: string;
  impact: (m: string) => string;
  escalate: boolean;
  checks: string[];
}

const RULES: Rule[] = [
  {
    category: 'Database',
    match: /sql|database|deadlock|jdbc|connection pool|constraint|query|transaction|duplicate key/i,
    title: (m) => `${m} data operations are failing`,
    rca: 'The service could not complete a database operation. Likely causes are exhausted connection pools, lock contention/deadlocks, slow queries or a schema/constraint mismatch after a recent change.',
    impact: (m) => `Customers may be unable to save or retrieve information in ${m}, risking lost transactions and stale data.`,
    escalate: true,
    checks: ['connection pool saturation', 'long-running or blocking queries', 'schema or constraint changes'],
  },
  {
    category: 'Network & Connectivity',
    match: /timeout|timed out|econn|connection (?:refused|reset)|unreachable|socket|network|\b50[234]\b/i,
    title: (m) => `${m} is slow or unavailable due to connection timeouts`,
    rca: 'A downstream call did not respond in time or the connection was refused/reset. Likely causes are an overloaded or restarting dependency, DNS/network faults, or timeouts configured too aggressively.',
    impact: (m) => `Users experience delays or failed requests in ${m}, which can cause abandoned journeys and support contacts.`,
    escalate: false,
    checks: ['dependency health and latency', 'timeout and retry configuration', 'network/DNS stability'],
  },
  {
    category: 'Authentication & Authorization',
    match: /unauthori[sz]ed|forbidden|\b40[13]\b|token|credential|expired|access denied|authenticat/i,
    title: (m) => `Users are unexpectedly denied access in ${m}`,
    rca: 'Requests were rejected because of invalid, expired or missing credentials or insufficient permissions. Likely causes are token expiry/refresh failures, misconfigured roles or clock skew between services.',
    impact: (m) => `Legitimate users are blocked from ${m} features, and failed sign-ins may mask security incidents.`,
    escalate: true,
    checks: ['token lifetime and refresh flow', 'role/permission mappings', 'clock synchronisation'],
  },
  {
    category: 'Resource Exhaustion',
    match: /out of memory|outofmemory|heap|disk|no space|quota|too many open files|thread pool|rate limit/i,
    title: (m) => `${m} is running out of system resources`,
    rca: 'The process exhausted a finite resource such as memory, disk, file handles or threads. Likely causes are a leak, unbounded caching/queues or an unexpected load spike.',
    impact: (m) => `${m} may slow down or crash entirely, potentially affecting every user of the platform.`,
    escalate: true,
    checks: ['memory/heap growth trend', 'unbounded queues or caches', 'capacity and autoscaling limits'],
  },
  {
    category: 'Data Handling',
    match: /null|undefined|cannot read prop|nullpointer|nullreference|missing|not found|index out of/i,
    title: (m) => `${m} fails when expected information is missing`,
    rca: 'Code accessed a value that was null, undefined or absent. Likely causes are missing defensive checks, incomplete upstream data or an unhandled edge case in a recent release.',
    impact: (m) => `Some user actions in ${m} fail unexpectedly, producing error screens or incomplete results.`,
    escalate: false,
    checks: ['null/empty input handling', 'upstream payload completeness', 'recent release changes'],
  },
  {
    category: 'Validation',
    match: /valid|malformed|parse|format|schema|illegal argument|bad request|\b400\b/i,
    title: (m) => `${m} mishandles certain user input`,
    rca: 'Input or payload did not match the expected format or schema. Likely causes are missing client-side validation, contract drift between services, or unsupported characters/values.',
    impact: (m) => `Users receive confusing failures in ${m} when submitting certain data.`,
    escalate: false,
    checks: ['request/response contract versions', 'client and server validation rules', 'encoding and locale handling'],
  },
  {
    category: 'Integration',
    match: /api|gateway|upstream|downstream|service|payment|http|client/i,
    title: (m) => `${m} cannot reliably reach a dependent service`,
    rca: 'A call to an integrated service failed. Likely causes are a contract change, unavailable third-party service or missing fallback/circuit-breaker behaviour.',
    impact: (m) => `Features in ${m} that rely on partner services may be unavailable, affecting dependent business processes.`,
    escalate: false,
    checks: ['third-party status and SLAs', 'contract/versioning changes', 'fallback and circuit breaker behaviour'],
  },
];

const FALLBACK: Rule = {
  category: 'Uncategorized',
  match: /./,
  title: (m) => `${m} is raising unexpected errors`,
  rca: 'The error does not match a known pattern. Review the sample stack traces and recent deployments to identify the faulty component.',
  impact: (m) => `Users of ${m} may encounter unexpected failures. Business impact needs triage.`,
  escalate: false,
  checks: ['recent deployments', 'sample stack traces'],
};

const titleCase = (s: string) =>
  s.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'Application';

function ruleFor(c: ClusterDraft, category?: string): Rule {
  // A category decided elsewhere (the server uses the agent repo's knowledge base) wins over the keyword heuristic.
  if (category) return RULES.find((r) => r.category === category) ?? FALLBACK;
  const haystack = `${c.signature} ${c.samples.map((s) => `${s.stackTrace ?? ''} ${s.error ?? ''}`).join(' ').slice(0, 800)}`;
  return RULES.find((r) => r.match.test(haystack)) ?? FALLBACK;
}

function severityFor(c: ClusterDraft, rule: Rule): Severity {
  const order: Severity[] = ['Low', 'Medium', 'High', 'Critical'];
  if (c.fatalCount > 0) return 'Critical';
  let i = c.occurrences >= 100 ? 3 : c.occurrences >= 25 ? 2 : c.occurrences >= 5 ? 1 : 0;
  if (rule.escalate && i < 3) i++;
  return order[i];
}

/**
 * Rule-based analysis of a cluster. `category` (one of the RULES categories, or 'Uncategorized') overrides the built-in
 * keyword matching; the severity bump, root cause and business impact then follow that category.
 */
export function analyzeCluster(c: ClusterDraft, category?: string): Omit<ErrorCluster, 'relatedBugIds' | 'testCaseIds'> {
  const rule = ruleFor(c, category);
  const mod = titleCase(c.module);
  const confidence =
    (rule === FALLBACK ? 0.5 : 0.68) + (c.hasType ? 0.1 : 0) + (c.hasStack ? 0.1 : 0) + Math.min(0.1, c.occurrences / 500);
  return {
    id: c.id,
    signature: c.signature,
    // A supplied category is kept verbatim even when it is not one of the built-in groups (its texts then use the fallback).
    category: category ?? rule.category,
    module: c.module,
    appName: c.samples[0]?.appName,
    service: c.samples[0]?.service,
    context: c.samples[0]?.context,
    severity: severityFor(c, rule),
    occurrences: c.occurrences,
    groupBasis: c.groupBasis,
    groupKey: c.groupKey,
    fatalCount: c.fatalCount,
    firstSeen: c.firstSeen,
    lastSeen: c.lastSeen,
    confidenceScore: Math.min(0.98, Math.round(confidence * 100) / 100),
    summary: `${c.occurrences} occurrence(s) of "${c.signature}" in ${mod}${c.fatalCount ? `, including ${c.fatalCount} fatal` : ''}.`,
    businessImpact: rule.impact(mod),
    rootCause: `${rule.rca}\n\n**Suggested checks**\n${rule.checks.map((x) => `- ${x}`).join('\n')}`,
    bugTitle: rule.title(mod),
    samples: c.samples,
  };
}

// ------------------------------------------------ 9. Regression test cases

const PRIORITY_BY_SEVERITY: Record<Severity, Severity> = {
  Critical: 'Critical',
  High: 'High',
  Medium: 'Medium',
  Low: 'Low',
};

export function generateTestCases(c: ErrorCluster): TestCase[] {
  const rule = RULES.find((r) => r.category === c.category) ?? FALLBACK;
  const suffix = c.id.replace('CL-', '');
  const mod = titleCase(c.module);
  const base = { clusterId: c.id, priority: PRIORITY_BY_SEVERITY[c.severity] };
  return [
    {
      ...base,
      id: `TC-${suffix}-01`,
      scenario: `Verify ${mod} no longer fails with: ${c.signature}`,
      preconditions: [`${mod} deployed with the fix`, 'Test data reproducing the original failure is available'],
      steps: [
        `Recreate the conditions that produced "${c.signature}"`,
        `Execute the affected ${mod} operation`,
        'Review the application log and the user-facing response',
      ],
      expectedResults: ['Operation completes successfully or fails gracefully', 'No matching ERROR/FATAL entry is logged'],
    },
    {
      ...base,
      id: `TC-${suffix}-02`,
      scenario: `Verify graceful recovery in ${mod} for ${c.category.toLowerCase()} failures`,
      preconditions: [`Fault injection or stubbing is available for ${rule.checks[0]}`],
      steps: [
        `Inject a ${c.category.toLowerCase()} fault into the dependency of ${mod}`,
        'Perform the affected user journey',
        'Remove the fault and repeat the journey',
      ],
      expectedResults: [
        'User sees a clear, non-technical message while the fault is active',
        'No data is lost or corrupted',
        'Normal behaviour resumes automatically once the fault is removed',
      ],
    },
    {
      ...base,
      id: `TC-${suffix}-03`,
      scenario: `Verify monitoring and alerting for ${mod} error "${c.signature.slice(0, 60)}"`,
      preconditions: ['Monitoring and alert rules are configured for the module'],
      steps: ['Trigger the error condition in a test environment', 'Check the log aggregator and alert channel'],
      expectedResults: ['The error is logged with correlation id and module name', 'An alert is raised within the agreed SLA'],
    },
  ];
}

// ------------------------------------------------------------ Bug story

export function buildBugStory(c: ErrorCluster, now = new Date().toISOString()): BugStory {
  const rule = RULES.find((r) => r.category === c.category) ?? FALLBACK;
  const mod = titleCase(c.module);
  const ac = (n: number, description: string): AcceptanceCriteria => ({ id: `AC-${n}`, description });
  return {
    id: `BUG-${c.id.replace('CL-', '')}`,
    clusterId: c.id,
    title: c.bugTitle,
    description:
      `${c.summary} First seen ${c.firstSeen.slice(0, 10)}, last seen ${c.lastSeen.slice(0, 10)}. ` +
      `Category: ${c.category}. Severity: ${c.severity}.`,
    rootCause: c.rootCause,
    businessImpact: c.businessImpact,
    acceptanceCriteria: [
      ac(1, `The error "${c.signature}" is no longer logged under normal operation in ${mod}`),
      ac(2, `The affected user journey completes successfully or fails with a clear, actionable message`),
      ac(3, `Root cause is confirmed against: ${rule.checks.join(', ')}`),
      ac(4, 'Regression tests for this cluster pass in CI and an alert exists for recurrence'),
    ],
    severity: c.severity,
    createdAt: now,
    updatedAt: now,
  };
}

import { CountBucket, DashboardMetrics, ErrorCluster, LogEntry, SEVERITIES } from '../src/app/models';
import { analyzeCluster, ClusterDraft, locationInfo } from '../src/app/core/mock/log-pipeline';
import { categorizeRecords } from './categorizer';
import { reportCategoryFor } from './report-categories';
import { Store, StoredRecord } from './store';

/** The files the user selected: a set of file ids, or null for "all files". */
export type Scope = Set<string> | null;

/** `?files=` query value: absent or "all" means every file; "" means no file. */
export function parseScope(param: string | null): Scope {
  if (param === null || param === 'all') return null;
  return new Set(
    param
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Records that belong to the selection. Records stored without a file id (legacy) count only for "all files". */
function inScope(scope: Scope, r: StoredRecord): boolean {
  return scope === null ? true : !!r.fileId && scope.has(r.fileId);
}

interface Row {
  cluster: ErrorCluster;
  records: LogEntry[];
}

/**
 * Every cluster that has at least one record in the selection, with its numbers recomputed from those records only.
 * Shared fields (AI bug title, bug stories, test cases) are kept from the stored cluster.
 */
function rows(store: Store, scope: Scope): Row[] {
  const byCluster = store.rawOccurrences();
  const out: Row[] = [];
  for (const c of store.rawClusterList()) {
    const stored = byCluster[c.id] ?? [];
    let records: LogEntry[] = scope === null ? (stored.length ? stored : c.samples) : stored.filter((r) => inScope(scope, r));
    if (!records.length) continue;
    const first = records[0];
    const timestamps = records.map((r) => r.timestamp).sort();
    const draft: ClusterDraft = {
      id: c.id,
      groupBasis: c.groupBasis ?? 'module+signature',
      groupKey: c.groupKey ?? '',
      signature: c.signature,
      module: c.module,
      occurrences: records.length,
      fatalCount: records.filter((r) => r.level === 'FATAL').length,
      firstSeen: timestamps[0],
      lastSeen: timestamps[timestamps.length - 1],
      samples: records.slice(0, 5),
      records,
      hasStack: records.some((r) => !!r.stackTrace),
      hasType: records.some((r) => !!r.exceptionType),
    };
    const category = reportCategoryFor(first.context, first.url) ?? categorizeRecords(records);
    const analysis = analyzeCluster(draft, category);
    out.push({
      records,
      cluster: {
        ...analysis,
        ...locationInfo({ ...c, samples: draft.samples }),
        bugTitle: c.bugTitle,
        relatedBugIds: store.listBugs(c.id).map((b) => b.id),
        testCaseIds: store.listTests(c.id).map((t) => t.id),
      },
    });
  }
  return out;
}

/** Clusters for the selected files (each cluster's frequency counts only those files). */
export function clusterView(store: Store, scope: Scope): ErrorCluster[] {
  return rows(store, scope).map((r) => r.cluster);
}

/** Dashboard numbers for the selected files. */
export function metricsView(store: Store, scope: Scope): DashboardMetrics {
  const all = rows(store, scope);
  const clusters = all.map((r) => r.cluster);
  const files = store.listFiles().filter((f) => scope === null || scope.has(f.id));
  const totalErrors = clusters.reduce((n, c) => n + c.occurrences, 0);
  const count = (s: string) => clusters.filter((c) => c.severity === s).length;

  const bySeverity: CountBucket[] = SEVERITIES.map((label) => ({
    label,
    value: clusters.filter((c) => c.severity === label).reduce((n, c) => n + c.occurrences, 0),
  }));

  // Errors per logging context, from the same records the clusters were built from.
  const byContext = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const { records } of all) {
    for (const r of records) {
      const key = r.context ?? r.module ?? 'unknown';
      byContext.set(key, (byContext.get(key) ?? 0) + 1);
      const day = r.timestamp.slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
  }
  return {
    totalLogs: files.reduce((n, f) => n + (f.totalLogs ?? 0), 0),
    totalErrors,
    uniqueClusters: clusters.length,
    critical: count('Critical'),
    high: count('High'),
    medium: count('Medium'),
    low: count('Low'),
    bySeverity,
    byModule: [...byContext]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)),
    trend: [...perDay]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-30),
  };
}

/** Stored error records of one cluster that belong to the selection (for the occurrences table). */
export function recordsView(store: Store, clusterId: string, scope: Scope): LogEntry[] | undefined {
  const row = rows(store, scope).find((r) => r.cluster.id === clusterId);
  if (row) return row.records;
  return store.getCluster(clusterId) ? [] : undefined;
}

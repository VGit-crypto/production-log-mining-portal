import fs from 'node:fs';
import path from 'node:path';
import { BugStory, DashboardMetrics, ErrorCluster, LogEntry, OccurrencePage, OccurrenceQuery, TestCase } from '../src/app/models';
import {
  buildMetrics,
  entryKey,
  locationInfo,
  MAX_OCCURRENCES_PER_CLUSTER,
  queryOccurrences,
} from '../src/app/core/mock/log-pipeline';
import { DATA_FILE } from './config';

type StoredCluster = Omit<ErrorCluster, 'relatedBugIds' | 'testCaseIds'>;

interface State {
  totalLogs: number;
  totalErrors: number;
  timeline: Record<string, number>;
  clusters: Record<string, StoredCluster>;
  bugs: Record<string, BugStory>;
  tests: Record<string, TestCase>;
  /** Every error log record per cluster (the individual occurrences behind the frequency). */
  occurrences: Record<string, LogEntry[]>;
  /** SHA-256 of every uploaded file, so the exact same file is not processed twice. */
  files: Record<string, { fileName: string; at: string }>;
}

const empty = (): State => ({
  totalLogs: 0, totalErrors: 0, timeline: {}, clusters: {}, bugs: {}, tests: {}, occurrences: {}, files: {},
});

/** JSON-file persistence. Swap for a database in production; the interface is deliberately small. */
export class Store {
  private state: State = this.load();
  private deferDepth = 0;
  private dirty = false;

  /** Runs several mutations and writes the file once at the end. */
  batch<T>(fn: () => T): T {
    this.deferDepth++;
    try {
      return fn();
    } finally {
      if (--this.deferDepth === 0 && this.dirty) this.save();
    }
  }

  hasFile(hash: string): boolean {
    return !!this.state.files[hash];
  }

  markFile(hash: string, fileName: string): void {
    this.state.files[hash] = { fileName, at: new Date().toISOString() };
    this.save();
  }

  /** Records of `incoming` that are not stored yet for this cluster (dedupe across uploads, never within one file). */
  freshRecords(clusterId: string, incoming: LogEntry[]): LogEntry[] {
    const seen = new Set((this.state.occurrences[clusterId] ?? []).map(entryKey));
    return incoming.filter((r) => !seen.has(entryKey(r)));
  }

  /** Stores the not-yet-stored records (up to the per-cluster cap) and returns them. */
  addOccurrences(clusterId: string, incoming: LogEntry[]): LogEntry[] {
    const existing = this.state.occurrences[clusterId] ?? [];
    const fresh = this.freshRecords(clusterId, incoming);
    const room = Math.max(0, MAX_OCCURRENCES_PER_CLUSTER - existing.length);
    const stored = fresh.slice(0, room).map((r, i) => ({ ...r, id: `${entryKey(r)}-${existing.length + i}` }));
    this.state.occurrences[clusterId] = existing.concat(stored);
    this.save();
    return fresh;
  }

  occurrenceCount(clusterId: string): number {
    return this.state.occurrences[clusterId]?.length ?? 0;
  }

  /** Occurrence page; clusters stored before full storage fall back to their (up to 5) sample logs. */
  queryOccurrences(clusterId: string, q: OccurrenceQuery): OccurrencePage | undefined {
    const cluster = this.state.clusters[clusterId];
    if (!cluster) return undefined;
    const all = this.state.occurrences[clusterId]?.length ? this.state.occurrences[clusterId] : cluster.samples;
    return queryOccurrences(all, q);
  }

  addTotals(logs: number, errorTimestamps: string[]): void {
    this.state.totalLogs += logs;
    this.state.totalErrors += errorTimestamps.length;
    for (const ts of errorTimestamps) {
      const day = ts.slice(0, 10);
      this.state.timeline[day] = (this.state.timeline[day] ?? 0) + 1;
    }
    this.save();
  }

  rawCluster(id: string): StoredCluster | undefined {
    return this.state.clusters[id];
  }

  putCluster(c: StoredCluster): void {
    this.state.clusters[c.id] = c;
    this.save();
  }

  listClusters(): ErrorCluster[] {
    return Object.values(this.state.clusters).map((c) => this.hydrate(c));
  }

  getCluster(id: string): ErrorCluster | undefined {
    const c = this.state.clusters[id];
    return c ? this.hydrate(c) : undefined;
  }

  listBugs(clusterId?: string): BugStory[] {
    return Object.values(this.state.bugs).filter((b) => !clusterId || b.clusterId === clusterId);
  }

  getBug(id: string): BugStory | undefined {
    return this.state.bugs[id];
  }

  putBug(b: BugStory): void {
    this.state.bugs[b.id] = b;
    this.save();
  }

  listTests(clusterId?: string): TestCase[] {
    return Object.values(this.state.tests).filter((t) => !clusterId || t.clusterId === clusterId);
  }

  /** Replaces all test cases of a cluster (regeneration may yield a different set). */
  replaceTests(clusterId: string, tests: TestCase[]): void {
    for (const t of this.listTests(clusterId)) delete this.state.tests[t.id];
    for (const t of tests) this.state.tests[t.id] = t;
    this.save();
  }

  metrics(): DashboardMetrics {
    return buildMetrics(Object.values(this.state.clusters), this.state);
  }

  private hydrate(c: StoredCluster): ErrorCluster {
    return {
      ...c,
      ...locationInfo(c),
      relatedBugIds: this.listBugs(c.id).map((b) => b.id),
      testCaseIds: this.listTests(c.id).map((t) => t.id),
    };
  }

  private load(): State {
    try {
      return { ...empty(), ...(JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Partial<State>) };
    } catch {
      return empty();
    }
  }

  private save(): void {
    if (this.deferDepth > 0) {
      this.dirty = true;
      return;
    }
    this.dirty = false;
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, DATA_FILE); // atomic replace: never leaves a half-written store
  }
}

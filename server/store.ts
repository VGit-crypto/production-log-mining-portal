import fs from 'node:fs';
import path from 'node:path';
import { BugStory, ErrorCluster, LogEntry, OccurrencePage, OccurrenceQuery, TestCase } from '../src/app/models';
import {
  entryKey,
  locationInfo,
  MAX_OCCURRENCES_PER_CLUSTER,
  queryOccurrences,
} from '../src/app/core/mock/log-pipeline';
import { DATA_FILE } from './config';

type StoredCluster = Omit<ErrorCluster, 'relatedBugIds' | 'testCaseIds'>;
/** An error record as stored: `fileId` is the SHA-256 of the uploaded file it came from. */
export type StoredRecord = LogEntry & { fileId?: string };
/** Per-file metadata. Totals are the file's own log and error counts (absent for files uploaded before tracking). */
export interface StoredFile {
  fileName: string;
  at: string;
  totalLogs?: number;
  totalErrors?: number;
}

interface State {
  totalLogs: number;
  totalErrors: number;
  timeline: Record<string, number>;
  clusters: Record<string, StoredCluster>;
  bugs: Record<string, BugStory>;
  tests: Record<string, TestCase>;
  /** Every error log record per cluster (the individual occurrences behind the frequency). */
  occurrences: Record<string, StoredRecord[]>;
  /** SHA-256 of every uploaded file, so the exact same file is not processed twice. */
  files: Record<string, StoredFile>;
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

  /**
   * Clears every upload, cluster, bug story, test case and file hash. The current store file is first copied to
   * store.backup-<timestamp>.json next to it, so the data can be recovered by hand.
   */
  reset(): { backupFile?: string } {
    let backupFile: string | undefined;
    if (fs.existsSync(DATA_FILE)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupFile = DATA_FILE.replace(/\.json$/, `.backup-${stamp}.json`);
      fs.copyFileSync(DATA_FILE, backupFile);
    }
    this.state = empty();
    this.save();
    return { backupFile };
  }

  hasFile(hash: string): boolean {
    return !!this.state.files[hash];
  }

  markFile(hash: string, fileName: string, totals?: { totalLogs: number; totalErrors: number }): void {
    this.state.files[hash] = { fileName, at: new Date().toISOString(), ...totals };
    this.save();
  }

  /** Records of `incoming` that are not stored yet for this cluster (dedupe across uploads, never within one file). */
  freshRecords(clusterId: string, incoming: LogEntry[]): LogEntry[] {
    const seen = new Set((this.state.occurrences[clusterId] ?? []).map(entryKey));
    return incoming.filter((r) => !seen.has(entryKey(r)));
  }

  /** Stores the not-yet-stored records (up to the per-cluster cap) and returns them. */
  addOccurrences(clusterId: string, incoming: LogEntry[], fileId?: string): LogEntry[] {
    const existing = this.state.occurrences[clusterId] ?? [];
    const fresh = this.freshRecords(clusterId, incoming);
    const room = Math.max(0, MAX_OCCURRENCES_PER_CLUSTER - existing.length);
    const stored: StoredRecord[] = fresh
      .slice(0, room)
      .map((r, i) => ({ ...r, id: `${entryKey(r)}-${existing.length + i}`, fileId }));
    this.state.occurrences[clusterId] = existing.concat(stored);
    this.save();
    return fresh;
  }

  /** Stored records of a cluster (its sample logs for data stored before every record was kept). */
  recordsOf(clusterId: string): LogEntry[] {
    const stored = this.state.occurrences[clusterId];
    return stored?.length ? stored : (this.state.clusters[clusterId]?.samples ?? []);
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

  /** Every uploaded file, newest first. */
  listFiles(): Array<StoredFile & { id: string }> {
    return Object.entries(this.state.files)
      .map(([id, f]) => ({ id, ...f }))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  /** Stored clusters without the derived bug/test lists (used by the file view). */
  rawClusterList(): StoredCluster[] {
    return Object.values(this.state.clusters);
  }

  /** Every stored error record, keyed by cluster id. */
  rawOccurrences(): Record<string, StoredRecord[]> {
    return this.state.occurrences;
  }

  /**
   * Deletes the given files: their error records, their file entries, and any cluster that no longer has a record
   * (with its bug stories and test cases). Returns how many clusters disappeared.
   */
  removeFiles(ids: string[]): { clustersRemoved: number; recordsRemoved: number } {
    const drop = new Set(ids);
    let recordsRemoved = 0;
    let clustersRemoved = 0;
    for (const [clusterId, records] of Object.entries(this.state.occurrences)) {
      const kept = records.filter((r) => !(r.fileId && drop.has(r.fileId)));
      recordsRemoved += records.length - kept.length;
      if (kept.length) {
        this.state.occurrences[clusterId] = kept;
        continue;
      }
      delete this.state.occurrences[clusterId];
      if (this.state.clusters[clusterId]) {
        delete this.state.clusters[clusterId];
        clustersRemoved++;
      }
      for (const b of Object.values(this.state.bugs)) if (b.clusterId === clusterId) delete this.state.bugs[b.id];
      for (const t of Object.values(this.state.tests)) if (t.clusterId === clusterId) delete this.state.tests[t.id];
    }
    for (const id of ids) delete this.state.files[id];
    this.save();
    return { clustersRemoved, recordsRemoved };
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

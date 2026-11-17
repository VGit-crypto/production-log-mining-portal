import { Injectable } from '@angular/core';
import {
  BugStory,
  DashboardMetrics,
  ErrorCluster,
  LogEntry,
  OccurrencePage,
  OccurrenceQuery,
  TestCase,
  UploadResult,
} from '../../models';
import {
  MAX_OCCURRENCES_PER_CLUSTER,
  queryOccurrences,
  analyzeCluster,
  buildBugStory,
  buildMetrics,
  clusterErrors,
  generateTestCases,
  isErrorRecord,
  locationInfo,
  mergeDraft,
} from './log-pipeline';

type StoredCluster = Omit<ErrorCluster, 'relatedBugIds' | 'testCaseIds'>;

interface State {
  totalLogs: number;
  totalErrors: number;
  timeline: Record<string, number>;
  clusters: Record<string, StoredCluster>;
  bugs: Record<string, BugStory>;
  tests: Record<string, TestCase>;
  occurrences: Record<string, LogEntry[]>;
}

const KEY = 'plmp.mock-store.v1';
const empty = (): State => ({ totalLogs: 0, totalErrors: 0, timeline: {}, clusters: {}, bugs: {}, tests: {}, occurrences: {} });

/** In-memory (localStorage-backed) stand-in for the backend persistence layer. */
@Injectable({ providedIn: 'root' })
export class MockStore {
  private state: State = this.load();

  ingest(entries: LogEntry[], fileName: string): UploadResult {
    const errors = entries.filter(isErrorRecord);
    this.state.totalLogs += entries.length;
    this.state.totalErrors += errors.length;
    for (const e of errors) {
      const day = e.timestamp.slice(0, 10);
      this.state.timeline[day] = (this.state.timeline[day] ?? 0) + 1;
    }

    let created = 0;
    let updated = 0;
    let tests = 0;
    for (const draft of clusterErrors(errors)) {
      const prev = this.state.clusters[draft.id];
      if (prev) {
        updated++;
        mergeDraft(draft, prev);
      } else {
        created++;
      }
      const analyzed = analyzeCluster(draft);
      this.state.clusters[draft.id] = analyzed;
      // Keep every occurrence (capped) so the details page can list them all; localStorage may reject big sets.
      this.state.occurrences[draft.id] = [...(this.state.occurrences[draft.id] ?? []), ...draft.records].slice(
        0,
        MAX_OCCURRENCES_PER_CLUSTER,
      );
      for (const t of generateTestCases({ ...analyzed, relatedBugIds: [], testCaseIds: [] })) {
        if (!this.state.tests[t.id]) tests++;
        this.state.tests[t.id] = t;
      }
    }
    this.save();
    return {
      uploadId: `UP-${Date.now().toString(36).toUpperCase()}`,
      fileName,
      totalRecords: entries.length,
      errorRecords: errors.length,
      clustersCreated: created,
      clustersUpdated: updated,
      testCasesGenerated: tests,
      testCasesQueued: 0,
    };
  }

  listClusters(): ErrorCluster[] {
    return Object.values(this.state.clusters).map((c) => this.hydrate(c));
  }

  getCluster(id: string): ErrorCluster | undefined {
    const c = this.state.clusters[id];
    return c ? this.hydrate(c) : undefined;
  }

  occurrencePage(clusterId: string, q: OccurrenceQuery): OccurrencePage | undefined {
    const cluster = this.state.clusters[clusterId];
    if (!cluster) return undefined;
    const all = this.state.occurrences[clusterId]?.length ? this.state.occurrences[clusterId] : cluster.samples;
    return queryOccurrences(all, q);
  }

  generateBug(clusterId: string, force: boolean): BugStory | undefined {
    const cluster = this.getCluster(clusterId);
    if (!cluster) return undefined;
    const existing = this.state.bugs[`BUG-${clusterId.replace('CL-', '')}`];
    if (existing && !force) return existing;
    const bug = buildBugStory(cluster);
    this.state.bugs[bug.id] = bug;
    this.save();
    return bug;
  }

  listBugs(clusterId?: string): BugStory[] {
    return Object.values(this.state.bugs).filter((b) => !clusterId || b.clusterId === clusterId);
  }

  updateBug(id: string, patch: Partial<BugStory>): BugStory | undefined {
    const cur = this.state.bugs[id];
    if (!cur) return undefined;
    const next: BugStory = { ...cur, ...patch, id: cur.id, clusterId: cur.clusterId, updatedAt: new Date().toISOString() };
    this.state.bugs[id] = next;
    this.save();
    return next;
  }

  listTests(clusterId?: string): TestCase[] {
    return Object.values(this.state.tests).filter((t) => !clusterId || t.clusterId === clusterId);
  }

  generateTests(clusterId: string): TestCase[] | undefined {
    const cluster = this.getCluster(clusterId);
    if (!cluster) return undefined;
    const tests = generateTestCases(cluster);
    tests.forEach((t) => (this.state.tests[t.id] = t));
    this.save();
    return tests;
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
      const raw = localStorage.getItem(KEY);
      return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
    } catch {
      return empty();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* storage unavailable or full: keep running in memory */
    }
  }
}

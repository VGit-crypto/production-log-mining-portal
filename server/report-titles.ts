import { ErrorCluster } from '../src/app/models';
import { REPORT_FILE } from './config';
import { findEntry, readReport } from './report-file';

/**
 * Adds `reportBugTitle` (the entry's `Cluster` value from SkypadLogs-Error-report.json) to clusters whose `context`
 * matches an entry. If several entries share a context, the one with the same URL wins. Unmatched clusters are unchanged.
 */
export function withReportTitles(clusters: ErrorCluster[]): ErrorCluster[] {
  const entries = readReport(REPORT_FILE).entries.filter((e) => e.Cluster);
  if (!entries.length) return clusters;
  return clusters.map((c) => {
    const hit = findEntry(entries, c.context, c.samples[0]?.url);
    return hit ? { ...c, reportBugId: hit.id, reportBugTitle: hit.Cluster } : c;
  });
}

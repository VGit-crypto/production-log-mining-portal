import { REPORT_TC_FILE } from './config';
import { CountBucket } from '../src/app/models';
import { findEntry, readReport } from './report-file';

/** `category_id` of the SkypadLogs-Error-report_TC.json entry with the same context (and url), if any. */
export function reportCategoryFor(context?: string, url?: string): string | undefined {
  const entries = readReport(REPORT_TC_FILE).entries.filter((e) => e.category_id);
  return findEntry(entries, context, url)?.category_id?.trim() || undefined;
}

/**
 * Dashboard "errors by context": each entry's `context` with its `totalErrorOccurrences` from the _TC report, highest
 * first. Entries sharing a context are summed. Undefined when the report is missing or has no such entries.
 */
export function reportContextTotals(): CountBucket[] | undefined {
  const totals = new Map<string, number>();
  for (const e of readReport(REPORT_TC_FILE).entries) {
    const n = Number(e.totalErrorOccurrences);
    if (e.context && Number.isFinite(n)) totals.set(e.context, (totals.get(e.context) ?? 0) + n);
  }
  if (!totals.size) return undefined;
  return [...totals]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Changes whenever the _TC report changes on disk (0 when it cannot be read). */
export const reportCategoriesVersion = (): number => readReport(REPORT_TC_FILE).mtimeMs;

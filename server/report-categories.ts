import { REPORT_TC_FILE } from './config';
import { findEntry, readReport } from './report-file';

/** `category_id` of the SkypadLogs-Error-report_TC.json entry with the same context (and url), if any. */
export function reportCategoryFor(context?: string, url?: string): string | undefined {
  const entries = readReport(REPORT_TC_FILE).entries.filter((e) => e.category_id);
  return findEntry(entries, context, url)?.category_id?.trim() || undefined;
}

/** Changes whenever the _TC report changes on disk (0 when it cannot be read). */
export const reportCategoriesVersion = (): number => readReport(REPORT_TC_FILE).mtimeMs;

import fs from 'node:fs';

/** One entry of the agent repo's `errors[]` reports (SkypadLogs-Error-report.json / SkypadLogs-Error-report_TC.json). */
export interface ReportEntry {
  id?: string;
  context?: string;
  url?: string;
  /** Cluster title, e.g. "[Crew Service] Passenger info is not loaded when no guests are found ..." */
  Cluster?: string;
  /** Failure category group, e.g. "Integration" (only in the _TC report). */
  category_id?: string;
  /** Number of error log records behind this entry (only in the _TC report). */
  totalErrorOccurrences?: number;
}

const cache = new Map<string, { mtimeMs: number; entries: ReportEntry[] }>();
const warned = new Set<string>();

/**
 * Entries of a report file plus its modification time (0 when the file cannot be read). The file is parsed again only
 * when it changes on disk.
 */
export function readReport(file: string): { mtimeMs: number; entries: ReportEntry[] } {
  try {
    const { mtimeMs } = fs.statSync(file);
    const hit = cache.get(file);
    if (hit?.mtimeMs === mtimeMs) return hit;
    const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
    const list = Array.isArray(data) ? data : ((data as { errors?: unknown[] }).errors ?? []);
    const fresh = { mtimeMs, entries: list.filter((e): e is ReportEntry => !!e && typeof e === 'object') };
    cache.set(file, fresh);
    warned.delete(file);
    return fresh;
  } catch (e) {
    if (!warned.has(file)) console.warn(`[report] could not read ${file}: ${(e as Error).message}`);
    warned.add(file);
    return { mtimeMs: 0, entries: [] };
  }
}

/** The entry with the same `context` (the one with the same `url` wins when several share a context). */
export function findEntry(entries: ReportEntry[], context?: string, url?: string): ReportEntry | undefined {
  if (!context) return undefined;
  const same = entries.filter((e) => e.context === context);
  return same.find((e) => e.url === url) ?? same[0];
}

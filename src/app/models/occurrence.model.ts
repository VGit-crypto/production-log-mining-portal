import { LogEntry } from './log-entry.model';

export type OccurrenceSort = 'timestamp' | 'level' | 'statusCode' | 'phase' | 'message' | 'correlationId';

export interface OccurrenceQuery {
  /** Zero-based page index. */
  page: number;
  pageSize: number;
  sort: OccurrenceSort;
  dir: 'asc' | 'desc';
  /** Free-text filter over message, error, correlation id, url and context. */
  q: string;
}

/** One page of the individual error log records that make up a cluster's frequency. */
export interface OccurrencePage {
  items: LogEntry[];
  /** Records matching the filter. */
  total: number;
  page: number;
  pageSize: number;
  /** Records stored for the cluster (before filtering). Lower than the cluster's frequency for legacy data. */
  stored: number;
}

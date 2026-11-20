import { LogEntry } from './log-entry.model';

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export const SEVERITIES: readonly Severity[] = ['Critical', 'High', 'Medium', 'Low'];

export type GroupBasis = 'context+url' | 'module+signature';

export interface ErrorCluster {
  id: string;
  /** Normalized error signature (ids, numbers, timestamps replaced with placeholders). */
  signature: string;
  category: string;
  /** Component the errors came from (the service name for most logs). Used for dashboard grouping. */
  module: string;
  /** Application the log belongs to (e.g. "Skypad-IFM"), when the log carries `appName`. */
  appName?: string;
  /** Service that logged the error (e.g. "AmadeusSeatMapService"), when the log carries `service`. */
  service?: string;
  /** Class.method that logged the error (e.g. "AmadeusSeatMapService.getSeatMapDetails"). */
  context?: string;
  severity: Severity;
  /**
   * Frequency = number of error log records in this group. `groupBasis` says which fields define the group:
   * 'context+url' (records sharing the same context AND url) or 'module+signature' (fallback when a log
   * has no context/url: same module and same normalized message).
   */
  occurrences: number;
  groupBasis?: GroupBasis;
  /** Human-readable value of the grouping fields, e.g. "OrderService.get | /v1/orders". */
  groupKey?: string;
  fatalCount: number;
  firstSeen: string;
  lastSeen: string;
  /** 0..1 confidence of the AI categorisation. */
  confidenceScore: number;
  /**
   * `Cluster` title from the agent repo's SkypadLogs-Error-report.json, matched on the cluster's `context`. Set by the server on read; absent when the report has no entry for the cluster.
   */
  reportBugTitle?: string;
  reportBugId?: string;
  summary: string;
  businessImpact: string;
  rootCause: string;
  bugTitle: string;
  samples: LogEntry[];
  relatedBugIds: string[];
  testCaseIds: string[];
}

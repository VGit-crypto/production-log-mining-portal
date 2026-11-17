export interface CountBucket {
  label: string;
  value: number;
}

export interface DashboardMetrics {
  totalLogs: number;
  totalErrors: number;
  uniqueClusters: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  bySeverity: CountBucket[];
  byModule: CountBucket[];
  /** label = ISO date (yyyy-MM-dd) */
  trend: CountBucket[];
}

import { Severity } from './error-cluster.model';

export interface AcceptanceCriteria {
  id: string;
  description: string;
}

export interface BugStory {
  id: string;
  clusterId: string;
  title: string;
  /**
   * The cluster's `Cluster` title from the agent repo's SkypadLogs-Error-report.json (same one the cluster pages show).
   * Set by the server on read, never stored; absent when the report has no entry for the cluster.
   */
  clusterTitle?: string;
  description: string;
  rootCause: string;
  businessImpact: string;
  acceptanceCriteria: AcceptanceCriteria[];
  severity: Severity;
  createdAt: string;
  updatedAt: string;
}

import { Severity } from './error-cluster.model';

export interface AcceptanceCriteria {
  id: string;
  description: string;
}

export interface BugStory {
  id: string;
  clusterId: string;
  title: string;
  description: string;
  rootCause: string;
  businessImpact: string;
  acceptanceCriteria: AcceptanceCriteria[];
  severity: Severity;
  createdAt: string;
  updatedAt: string;
}

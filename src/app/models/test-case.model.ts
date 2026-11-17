import { Severity } from './error-cluster.model';

export type TestPriority = Severity;

export interface TestCase {
  id: string;
  clusterId: string;
  scenario: string;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
  priority: TestPriority;
}

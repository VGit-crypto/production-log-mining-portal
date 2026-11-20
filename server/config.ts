import dotenv from 'dotenv';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

// 1) Portal-specific overrides, 2) the agent repo's own .env so both use the same AI endpoint.
// dotenv never overrides variables that are already set, so real environment variables win.
dotenv.config({ path: path.join(root, 'server', '.env'), quiet: true });

/** Sibling repo that owns the AI agents and prompts (Prod-error-AI-agent). */
export const AGENT_REPO = path.resolve(root, process.env['AGENT_REPO_PATH'] ?? '../Prod-error-AI-agent');
dotenv.config({ path: path.join(AGENT_REPO, '.env'), quiet: true });

/** Report produced by the agent repo's pipeline; its `Cluster` value (matched by context) is shown in the cluster table. */
export const REPORT_FILE = path.resolve(
  AGENT_REPO,
  process.env['REPORT_FILE'] ?? 'test-results/SkypadLogs-Error-report.json',
);

/** Report produced by the agent repo's pipeline; its `category_id` (matched by context) is each cluster's category. */
export const REPORT_TC_FILE = path.resolve(
  AGENT_REPO,
  process.env['REPORT_TC_FILE'] ?? 'test-results/SkypadLogs-Error-report_TC.json',
);

/** The agent repo's failure-category rules; used for clusters that have no entry in the _TC report. */
export const KB_FILE = path.resolve(
  AGENT_REPO,
  process.env['KB_FILE'] ?? 'packages/dynatrace/kb/logs-failure-categories.json',
);

export const PORT =Number(process.env['PORT'] ?? 3000);
export const HOST = process.env['HOST'] ?? '127.0.0.1';
export const MAX_UPLOAD_BYTES = Number(process.env['MAX_UPLOAD_MB'] ?? 50) * 1024 * 1024;
export const AI_CONCURRENCY = Math.max(1, Number(process.env['AI_CONCURRENCY'] ?? 2));
/** Retries for transient AI failures (5xx / 429 / network) and the per-call timeout. */
export const AI_RETRIES = Math.max(0, Number(process.env['AI_RETRIES'] ?? 3));
export const AI_TIMEOUT_MS = Math.max(10_000, Number(process.env['AI_TIMEOUT_SECONDS'] ?? 150) * 1000);
export const DATA_FILE = path.resolve(root, process.env['DATA_FILE'] ?? 'server/data/store.json');
export const WEB_DIST = path.join(root, 'dist', 'production-log-mining-portal', 'browser');

/** True when the variables the agents' AIProvider needs are present (values are never logged). */
export const aiConfigured = (): boolean =>
  !!(process.env['API_URL'] && process.env['API_KEY'] && process.env['MODEL_NAME']);

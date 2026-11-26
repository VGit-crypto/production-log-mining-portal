# Production Log Mining Portal

Angular 20 (standalone, signals, Angular Material) app that analyzes uploaded production logs and produces error clusters, business-friendly bug stories and regression test cases.

Check cluster frequency in any log file without the server or AI: `npm run cluster:freq -- <file> [--top 25] [--json]`.

Full description of the flow, rules and technical design: [docs/FLOW-AND-RULES.md](docs/FLOW-AND-RULES.md).

## Run

```bash
npm install
npm run dev          # API on :3000 + Angular on :4200 (proxied to the API), real AI agents
npm run start:mock   # UI only, rule-based in-browser mock, no AI and no server
npm run serve        # production build served by the API on :3000
```

Upload `sample-data/sample-skypad-logs.json` (Skypad-shaped; regenerate with
`node sample-data/generate-skypad-sample.mjs`) or `sample-data/sample-logs.ndjson` on the **Upload Logs** page.

## AI flow: reuses the agents in `../Prod-error-AI-agent`

`server/` is a small Node API (no framework) that runs the same agents, prompts and AI provider as the
`Prod-error-AI-agent` repo. They are **loaded from that repo at runtime, not copied** (`AGENT_REPO_PATH`,
default `../Prod-error-AI-agent`), so prompt changes there apply here.

| Portal action | Agent repo component used |
|---|---|
| Bug title (on upload, per new cluster) | `prompts/Bug-Title-generator-prompt.md`, same payload `{appName, context, url, message, error}` and post-processing as `analyze-skypad-errors.ts` (first line, ≤120 chars) |
| Test cases (queued on upload; **Generate / Regenerate Test Cases** button) | `TestCaseGeneratorService` + `prompts/testcase-generator-prompt.md`: 10 cases (5 positive, 3 negative, 2 edge), zod-validated, ids `TC-<clusterId>-NN`. Regenerating replaces the cluster's cases |
| Bug story (**Generate Bug Story**) | `BugStoryWriterAgent`: description + exactly 5 acceptance criteria |

Clustering follows the same rule as the agent repo: one cluster per `context + url` (logs without both fall back to
module + normalized message). A log record is an error when `level` is error/fatal **or** it has an `error` field.

Notes on how the agent output maps to the portal:
- Test cases are generated in a background queue after upload (one long AI call per cluster); the Test Cases page
  shows progress and refreshes itself. The prompt has no "preconditions" field, so preconditions are derived from the
  cluster's app/service/url.
- The bug-story agent does not write RCA or business impact; those two sections come from the rule-based cluster
  analysis (`core/mock/log-pipeline.ts`).
- If AI is unavailable, uploads still work with rule-based titles plus a warning, and AI endpoints return 503.

### Configuration

The agents' `AIProvider` needs `API_URL`, `API_KEY` and `MODEL_NAME`. The server loads, in order (existing environment
variables always win): `server/.env`, then `<AGENT_REPO_PATH>/.env`, so by default it reuses the agent repo's `.env`.
Other options: `PORT` (3000), `HOST` (127.0.0.1), `AI_CONCURRENCY` (2), `MAX_UPLOAD_MB` (200), `DATA_FILE`
(`server/data/store.json`). The API has no authentication, so keep it on localhost or put it behind your gateway.

Only these fields reach the model: `appName, service, context, url, statusCode, message, error` (as in the agent repo).

## Mock API (offline demo)

With `npm run start:mock` an HTTP interceptor (`core/mock/mock-api.interceptor.ts`) implements the REST contract in
the browser using the rule-based pipeline in `core/mock/log-pipeline.ts`. State is kept in `localStorage`.

### REST contract (all responses wrapped in `APIResponse<T>`)

| Method | Path | Body / result |
|---|---|---|
| POST | `/api/logs/upload` | multipart field `file` → `UploadResult` (progress events supported) |
| GET | `/api/pipeline/status` | `{ pendingClusters, failedClusters }` (background test-case generation) |
| GET | `/api/dashboard/metrics` | `DashboardMetrics` |
| GET | `/api/clusters`, `/api/clusters/:id` | `ErrorCluster[]` / `ErrorCluster` |
| POST | `/api/clusters/:id/bug-story` | `{ force?: boolean }` → `BugStory` |
| POST | `/api/clusters/:id/test-cases` | → `TestCase[]` |
| GET | `/api/bug-stories?clusterId=` | `BugStory[]` |
| PUT | `/api/bug-stories/:id` | `BugStory` → `BugStory` |
| GET | `/api/test-cases?clusterId=` | `TestCase[]` |

Jira and QMetry are not wired yet; `environment.integrations` holds placeholder flags and the intended
extension point is a backend endpoint per integration (e.g. `POST /api/bug-stories/:id/jira`).

## Structure

```
src/app
├─ core/       interceptors (api, loading, error), notification/loading/api services, global error handler,
│              shell layout, mock backend, data-loader helper
├─ shared/     charts (SVG, no chart lib), page-header, severity chip, stat card, error boundary, empty state, confirm dialog
├─ models/     LogEntry, ErrorCluster, BugStory, AcceptanceCriteria, TestCase, DashboardMetrics, APIResponse
├─ services/   LogUpload, ErrorCluster, BugStory, TestCase, Dashboard, Export
└─ features/   dashboard · upload · clusters · bug-stories · test-cases · reports   (each lazy-loaded via *.routes.ts)
```

## Notes

- Excel export uses the `xlsx` (SheetJS) package, lazy-loaded only when exporting. It is used for writing only.
- CSV exports neutralize spreadsheet formula injection since log text is untrusted.
- Google Fonts (Roboto, Material Icons) are loaded from the CDN in `index.html`; self-host them if your network blocks it.

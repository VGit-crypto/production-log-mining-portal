export const environment = {
  production: false,
  /** Base URL of the Log Mining REST API (which in turn calls Azure OpenAI server-side). */
  apiBaseUrl: '/api',
  /** When true an in-browser rule-based mock replaces the API (no server, no AI). npm run start:mock */
  useMockApi: true,
  mockLatencyMs: 350,
  upload: {
    maxFileSizeMb: 200,
    acceptedExtensions: ['.json', '.ndjson'],
  },
  // Placeholders for future integrations (handled by the backend, never by the browser).
  integrations: { jira: { enabled: false }, qmetry: { enabled: false } },
};

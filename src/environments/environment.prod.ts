export const environment = {
  production: true,
  apiBaseUrl: '/api',
  useMockApi: false,
  mockLatencyMs: 0,
  upload: {
    maxFileSizeMb: 200,
    acceptedExtensions: ['.json', '.ndjson'],
  },
  integrations: { jira: { enabled: false }, qmetry: { enabled: false } },
};

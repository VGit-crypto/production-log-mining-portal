// Generates sample-data/sample-skypad-logs.json: synthetic logs in the Skypad shape that the agent repo
// understands (appName, context, service, level, message, error, http.{url,statusCode}, correlationId).
// Usage: node sample-data/generate-skypad-sample.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const rnd = (n) => Math.floor(Math.random() * n);
const ts = () => new Date(Date.now() - rnd(5 * 86400000)).toISOString();

const scenarios = [
  { n: 14, appName: 'Skypad-IFM', service: 'GuestPreferencesService', context: 'GuestPreferencesService.getGuests', url: 'https://api.example.test/v1/guest-preferences?flight=XY216&date=291026', statusCode: 200, message: 'No guests returned for flight XY216 AUH-DEL on 291026', error: 'Error: Guest Preferences API returned an empty guest list\n    at GuestPreferencesService.getGuests (guest-preferences.service.ts:88:13)' },
  { n: 9, appName: 'Skypad-IFM', service: 'PassengerInfoService', context: 'PassengerInfoService.fetch', url: 'https://datahub.example.test/v2/passenger-info', statusCode: 404, message: 'Passenger info request failed', error: 'AxiosError: Request failed with status code 404\n    at settle (axios.js:19:12)\n    at PassengerInfoService.fetch (passenger-info.service.ts:41:9)' },
  { n: 6, appName: 'Skypad-IFM', service: 'FlightSchedulerJobService', context: 'FlightSchedulerJobService.sync', url: 'https://sched.example.test/v1/flights/sync', statusCode: 504, message: 'Flight sync job failed', error: 'Error: 504 Gateway Timeout: Read timed out after 30000ms' },
];
const infoNoise = Array.from({ length: 60 }, () => ({ appName: 'Skypad-IFM', service: 'Gateway', level: 'info', message: 'request ok', timestamp: ts(), correlationId: crypto.randomUUID() }));

const records = [
  ...scenarios.flatMap((s) => Array.from({ length: s.n }, () => ({
    timestamp: ts(), level: 'error', appName: s.appName, service: s.service, context: s.context,
    message: s.message, error: s.error, correlationId: crypto.randomUUID(), http: { statusCode: s.statusCode, url: s.url },
  }))),
  ...infoNoise,
].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

writeFileSync(join(dir, 'sample-skypad-logs.json'), JSON.stringify(records, null, 2));
console.log(`Wrote ${records.length} records (${scenarios.reduce((n, s) => n + s.n, 0)} errors in ${scenarios.length} groups).`);

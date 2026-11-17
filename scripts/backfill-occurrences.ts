/**
 * Attaches the individual error records of a log file to clusters that ALREADY exist in the running API,
 * without changing any count, title, test case or dashboard total. Use it for data uploaded before the portal
 * kept every occurrence, with the same file you originally uploaded.
 *
 *   npm run backfill -- <file.json|file.ndjson>          (API must be running; PORTAL_API overrides the URL)
 */
import { openAsBlob } from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run backfill -- <file.json|file.ndjson>');
  process.exit(1);
}
const api = process.env['PORTAL_API'] ?? 'http://127.0.0.1:3000';

async function main(): Promise<void> {
  const form = new FormData();
  form.append('file', await openAsBlob(path.resolve(file)), path.basename(file));
  const res = await fetch(`${api}/api/logs/upload?mode=backfill`, { method: 'POST', body: form });
  const body = (await res.json()) as { success: boolean; message?: string; data?: Record<string, unknown> };
  if (!res.ok || !body.success) throw new Error(`${res.status}: ${body.message ?? 'request failed'}`);
  const d = body.data!;
  console.log(`Backfill of ${d['fileName']}: ${d['clustersUpdated']} cluster(s) updated, ${d['occurrencesStored']} occurrence record(s) stored.`);
  for (const w of (d['warnings'] as string[] | undefined) ?? []) console.warn(`Warning: ${w}`);
}

main().catch((e: Error) => {
  console.error(`Backfill failed: ${e.message}`);
  process.exit(1);
});

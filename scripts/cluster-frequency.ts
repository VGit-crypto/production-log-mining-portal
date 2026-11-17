/**
 * Prints how often each error cluster occurs in a log file, using the same parse / error-detection /
 * normalization / clustering rules as the portal. Runs locally: no server, no AI, nothing is uploaded.
 *
 *   npm run cluster:freq -- <file.json|file.ndjson> [--top 20] [--json]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { analyzeCluster, clusterErrors, isErrorRecord, parseLogContent } from '../src/app/core/mock/log-pipeline';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && a !== args[args.indexOf('--top') + 1]);
const top = Number(args[args.indexOf('--top') + 1]) || 25;
const asJson = args.includes('--json');
if (!file) {
  console.error('Usage: npm run cluster:freq -- <file.json|file.ndjson> [--top 25] [--json]');
  process.exit(1);
}

const text = readFileSync(path.resolve(file), 'utf-8');
let skipped = 0;
let entries;
try {
  entries = parseLogContent(text, file);
} catch (e) {
  // Same tolerance as the agent repo's Skypad parser: keep valid object lines, skip stray non-JSON lines.
  const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^,/, '').replace(/,$/, '').trim());
  const objects = lines.filter((l) => l.startsWith('{') && l.endsWith('}'));
  const ok: string[] = [];
  for (const l of objects) {
    try {
      JSON.parse(l);
      ok.push(l);
    } catch {
      skipped++;
    }
  }
  if (!ok.length) {
    console.error(`Could not parse ${file}: ${(e as Error).message}`);
    process.exit(1);
  }
  skipped += lines.filter((l) => l && !objects.includes(l) && l !== '[' && l !== ']').length;
  entries = parseLogContent(ok.join('\n'), 'fallback.ndjson');
  console.warn(`Note: file is not strict JSON; parsed line by line (${skipped} non-record line(s) skipped).\n`);
}

const errors = entries.filter(isErrorRecord);
const clusters = clusterErrors(errors)
  .map((d) => ({ ...analyzeCluster(d), key: d.groupKey }))
  .sort((a, b) => b.occurrences - a.occurrences);

if (asJson) {
  console.log(JSON.stringify(clusters.map(({ samples, rootCause, businessImpact, summary, ...c }) => c), null, 2));
  process.exit(0);
}

const pct = (n: number) => `${((100 * n) / (errors.length || 1)).toFixed(1)}%`;
console.log(`File: ${file}`);
console.log(`Records: ${entries.length}   Error records: ${errors.length}   Clusters: ${clusters.length}\n`);
console.log(['#'.padStart(3), 'Cluster'.padEnd(10), 'Count'.padStart(6), 'Share'.padStart(6), 'Severity'.padEnd(8), 'Category'.padEnd(26), 'Last seen'.padEnd(10), 'Group / signature'].join('  '));
clusters.slice(0, top).forEach((c, i) => {
  const label = c.key.length > 70 ? c.key.slice(0, 67) + '...' : c.key;
  console.log(
    [String(i + 1).padStart(3), c.id.padEnd(10), String(c.occurrences).padStart(6), pct(c.occurrences).padStart(6), c.severity.padEnd(8), c.category.slice(0, 26).padEnd(26), c.lastSeen.slice(0, 10).padEnd(10), label].join('  '),
  );
});
if (clusters.length > top) console.log(`\n… ${clusters.length - top} more cluster(s). Use --top ${clusters.length} to show all.`);
const singles = clusters.filter((c) => c.occurrences === 1).length;
if (singles > clusters.length / 2 && clusters.length > 10) {
  console.log(`\nHint: ${singles} of ${clusters.length} clusters occur once. The group key (context + url) may include ids; consider normalizing URLs.`);
}

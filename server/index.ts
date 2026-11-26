import fs from 'node:fs';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { APIResponse, BugStory, OccurrenceSort } from '../src/app/models';
import { AGENT_REPO, aiConfigured, HOST, MAX_UPLOAD_BYTES, PORT, WEB_DIST } from './config';
import { HttpError, Pipeline } from './pipeline';
import { withReportTitles } from './report-titles';
import { Store } from './store';
import { clusterView, metricsView, parseScope, recordsView, Scope } from './view';
import { queryOccurrences } from '../src/app/core/mock/log-pipeline';

const store = new Store();
const pipeline = new Pipeline(store);

const send = <T>(res: ServerResponse, status: number, body: APIResponse<T> | object): void => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const ok = <T>(res: ServerResponse, data: T, message?: string) =>
  send(res, 200, { success: true, data, message, timestamp: new Date().toISOString() } satisfies APIResponse<T>);

/** The files selected in the UI (?files=id,id); absent means all files. */
function scopeOf(url: URL): Scope {
  return parseScope(url.searchParams.get('files'));
}

/** Cluster ids in the selected files (null = every cluster). */
function scopedClusterIds(scope: Scope): Set<string> | null {
  return scope === null ? null : new Set(clusterView(store, scope).map((c) => c.id));
}

/** Adds each story's cluster title from the report file (display only; never written to the store). */
function withClusterTitles(bugs: BugStory[]): BugStory[] {
  const titles = new Map(withReportTitles(store.listClusters()).map((c) => [c.id, c.reportBugTitle]));
  return bugs.map((b) => {
    const clusterTitle = titles.get(b.clusterId);
    return clusterTitle ? { ...b, clusterTitle } : b;
  });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new HttpError(413, 'Request body too large');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

/** Parses multipart/form-data with the platform's own Request.formData() (no extra dependency). */
async function readUpload(req: IncomingMessage): Promise<File> {
  const length = Number(req.headers['content-length'] ?? 0);
  if (length > MAX_UPLOAD_BYTES) throw new HttpError(413, `File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit`);
  if (!String(req.headers['content-type']).startsWith('multipart/form-data')) {
    throw new HttpError(400, 'Expected multipart/form-data');
  }
  const form = await new Request('http://localhost', {
    method: 'POST',
    headers: { 'content-type': String(req.headers['content-type']) },
    body: Readable.toWeb(req) as ReadableStream,
    duplex: 'half',
  } as RequestInit).formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Multipart field "file" is required');
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, `File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit`);
  return file;
}

async function route(req: IncomingMessage, res: ServerResponse, method: string, p: string, url: URL): Promise<void> {
  const clusterId = url.searchParams.get('clusterId') ?? undefined;
  let m: RegExpExecArray | null;
  const match = (re: RegExp) => (m = re.exec(p));

  // Clears all stored data. The store file is backed up first (see Store.reset).
  if (method === 'DELETE' && p === '/api/data') {
    const { backupFile } = store.reset();
    pipeline.reset();
    return ok(res, { cleared: true, backupFile: backupFile ? path.basename(backupFile) : null }, 'All data cleared');
  }
  if (method === 'GET' && p === '/api/files') {
    const counts = new Map<string, number>();
    for (const recs of Object.values(store.rawOccurrences())) {
      for (const r of recs) if (r.fileId) counts.set(r.fileId, (counts.get(r.fileId) ?? 0) + 1);
    }
    return ok(res, store.listFiles().map((f) => ({ ...f, storedRecords: counts.get(f.id) ?? 0 })));
  }
  if (method === 'POST' && p === '/api/files/delete') {
    const body = await readJson(req);
    const ids = Array.isArray(body['ids']) ? body['ids'].map(String) : [];
    if (!ids.length) throw new HttpError(400, 'Select at least one file to delete');
    const result = store.removeFiles(ids);
    pipeline.resync();
    return ok(res, { deleted: ids.length, ...result }, 'Files deleted');
  }
  if (method === 'GET' && p === '/api/health') return ok(res, { status: 'up', aiConfigured: aiConfigured() });
  // Picks up a regenerated SkypadLogs-Error-report_TC.json without a restart (no-op when it has not changed).
  if (method === 'GET') pipeline.syncCategories();
  if (method === 'POST' && p === '/api/logs/upload') {
    const file = await readUpload(req);
    // ?mode=backfill attaches occurrence records to existing clusters without changing counts (see README).
    const mode = url.searchParams.get('mode') === 'backfill' ? 'backfill' : 'normal';
    return ok(res, await pipeline.ingest(await file.text(), file.name, mode), mode === 'backfill' ? 'Occurrences attached' : 'Logs processed');
  }
  if (method === 'GET' && p === '/api/pipeline/status') return ok(res, pipeline.status());
  if (method === 'GET' && p === '/api/dashboard/metrics') return ok(res, metricsView(store, scopeOf(url)));
  if (method === 'GET' && p === '/api/clusters') return ok(res, withReportTitles(clusterView(store, scopeOf(url))));
  if (method === 'GET' && match(/^\/api\/clusters\/([\w-]+)\/occurrences$/)) {
    const sorts: OccurrenceSort[] = ['timestamp', 'level', 'statusCode', 'phase', 'message', 'correlationId'];
    const sort = url.searchParams.get('sort') as OccurrenceSort;
    const records = recordsView(store, m![1], scopeOf(url));
    if (!records) throw new HttpError(404, `Cluster ${m![1]} not found`);
    const page = queryOccurrences(records, {
      page: Number(url.searchParams.get('page') ?? 0),
      pageSize: Number(url.searchParams.get('pageSize') ?? 25),
      sort: sorts.includes(sort) ? sort : 'timestamp',
      dir: url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc',
      q: (url.searchParams.get('q') ?? '').slice(0, 200),
    });
    return ok(res, page);
  }
  if (method === 'GET' && match(/^\/api\/clusters\/([\w-]+)$/)) {
    const c = clusterView(store, scopeOf(url)).find((x) => x.id === m![1]);
    if (!c) throw new HttpError(404, `Cluster ${m![1]} not found in the selected files`);
    return ok(res, withReportTitles([c])[0]);
  }
  if (method === 'POST' && match(/^\/api\/clusters\/([\w-]+)\/bug-story$/)) {
    const body = await readJson(req);
    return ok(res, await pipeline.createBugStory(m![1], body['force'] === true), 'Bug story generated');
  }
  if (method === 'POST' && match(/^\/api\/clusters\/([\w-]+)\/test-cases$/)) {
    return ok(res, await pipeline.regenerateTests(m![1]), 'Test cases generated');
  }
  if (method === 'GET' && p === '/api/bug-stories') {
    const ids = scopedClusterIds(scopeOf(url));
    return ok(res, withClusterTitles(store.listBugs(clusterId).filter((b) => !ids || ids.has(b.clusterId))));
  }
  if (method === 'PUT' && match(/^\/api\/bug-stories\/([\w-]+)$/)) {
    const cur = store.getBug(m![1]);
    if (!cur) throw new HttpError(404, `Bug story ${m![1]} not found`);
    const b = (await readJson(req)) as Partial<BugStory>;
    // Only the editable fields are accepted from the client.
    const next: BugStory = {
      ...cur,
      title: String(b.title ?? cur.title).slice(0, 200),
      description: String(b.description ?? cur.description),
      rootCause: String(b.rootCause ?? cur.rootCause),
      businessImpact: String(b.businessImpact ?? cur.businessImpact),
      acceptanceCriteria: Array.isArray(b.acceptanceCriteria)
        ? b.acceptanceCriteria.map((a) => ({ id: String(a.id), description: String(a.description) }))
        : cur.acceptanceCriteria,
      updatedAt: new Date().toISOString(),
    };
    store.putBug(next);
    return ok(res, withClusterTitles([next])[0], 'Bug story saved');
  }
  if (method === 'GET' && p === '/api/test-cases') {
    const ids = scopedClusterIds(scopeOf(url));
    return ok(res, store.listTests(clusterId).filter((t) => !ids || ids.has(t.clusterId)));
  }
  throw new HttpError(404, `No route for ${method} ${p}`);
}

/** Serves the built Angular app (with SPA fallback) so a single process can host UI + API. */
function serveStatic(res: ServerResponse, p: string): boolean {
  if (!fs.existsSync(WEB_DIST)) return false;
  const safe = path.normalize(decodeURIComponent(p)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(WEB_DIST, safe);
  if (!file.startsWith(WEB_DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(WEB_DIST, 'index.html');
  }
  const types: Record<string, string> = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
  };
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
  return true;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    if (!url.pathname.startsWith('/api/')) {
      if (method === 'GET' && serveStatic(res, url.pathname)) return;
      return send(res, 404, { success: false, message: 'Not found' });
    }
    route(req, res, method, url.pathname, url).catch((e: unknown) => {
      const err = e instanceof HttpError ? e : new HttpError(500, 'Internal server error');
      if (!(e instanceof HttpError)) console.error('[server]', e);
      send(res, err.status, { success: false, message: err.message, errors: [err.message], timestamp: new Date().toISOString() });
    });
  })
  .listen(PORT, HOST, () => {
    console.log(`Log Mining API on http://${HOST}:${PORT}  (agents: ${AGENT_REPO})`);
    console.log(aiConfigured() ? 'AI: configured' : 'AI: NOT configured, set API_URL, API_KEY, MODEL_NAME');
    pipeline.recategorize();
    pipeline.resumePending();
  });

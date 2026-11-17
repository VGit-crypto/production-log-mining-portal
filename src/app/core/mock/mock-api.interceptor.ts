import {
  HttpErrorResponse,
  HttpEvent,
  HttpEventType,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { concat, defer, delay, from, map, Observable, of, switchMap, take, throwError, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { APIResponse, OccurrenceSort } from '../../models';
import { parseLogContent } from './log-pipeline';
import { MockStore } from './mock-store';

const envelope = <T>(data: T, message?: string): APIResponse<T> => ({
  success: true,
  data,
  message,
  timestamp: new Date().toISOString(),
});
const ok = <T>(req: HttpRequest<unknown>, data: T, message?: string) =>
  new HttpResponse({ status: 200, url: req.url, body: envelope(data, message) });
const fail = (req: HttpRequest<unknown>, status: number, message: string) =>
  throwError(
    () => new HttpErrorResponse({ status, url: req.url, error: { success: false, message, errors: [message] } }),
  );
const delayed =
  <T>() =>
  (src: Observable<T>) =>
    src.pipe(delay(environment.mockLatencyMs));

/** Implements the REST contract in the browser. Active only when environment.useMockApi is true. */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.useMockApi || !req.url.startsWith(environment.apiBaseUrl + '/')) return next(req);
  const store = inject(MockStore);
  const path = req.url.slice(environment.apiBaseUrl.length).split('?')[0];
  const m = (re: RegExp) => re.exec(path);
  let res: Observable<HttpEvent<unknown>>;
  let match: RegExpExecArray | null;

  if (req.method === 'POST' && path === '/logs/upload') {
    return upload(req, store); // manages its own timing so progress events are visible
  } else if (req.method === 'GET' && path === '/pipeline/status') {
    res = of(ok(req, { pendingClusters: 0, failedClusters: 0 }));
  } else if (req.method === 'GET' && path === '/dashboard/metrics') {
    res = of(ok(req, store.metrics()));
  } else if (req.method === 'GET' && path === '/clusters') {
    res = of(ok(req, store.listClusters()));
  } else if (req.method === 'GET' && (match = m(/^\/clusters\/([\w-]+)\/occurrences$/))) {
    const p = req.params;
    const page = store.occurrencePage(match[1], {
      page: Number(p.get('page') ?? 0),
      pageSize: Number(p.get('pageSize') ?? 25),
      sort: (p.get('sort') as OccurrenceSort) ?? 'timestamp',
      dir: p.get('dir') === 'asc' ? 'asc' : 'desc',
      q: p.get('q') ?? '',
    });
    res = page ? of(ok(req, page)) : fail(req, 404, `Cluster ${match[1]} not found`);
  } else if (req.method === 'GET' && (match = m(/^\/clusters\/([\w-]+)$/))) {
    const c = store.getCluster(match[1]);
    res = c ? of(ok(req, c)) : fail(req, 404, `Cluster ${match[1]} not found`);
  } else if (req.method === 'POST' && (match = m(/^\/clusters\/([\w-]+)\/bug-story$/))) {
    const force = !!(req.body as { force?: boolean } | null)?.force;
    const bug = store.generateBug(match[1], force);
    res = bug ? of(ok(req, bug, 'Bug story generated')) : fail(req, 404, `Cluster ${match[1]} not found`);
  } else if (req.method === 'POST' && (match = m(/^\/clusters\/([\w-]+)\/test-cases$/))) {
    const t = store.generateTests(match[1]);
    res = t ? of(ok(req, t, 'Test cases generated')) : fail(req, 404, `Cluster ${match[1]} not found`);
  } else if (req.method === 'GET' && path === '/bug-stories') {
    res = of(ok(req, store.listBugs(req.params.get('clusterId') ?? undefined)));
  } else if (req.method === 'PUT' && (match = m(/^\/bug-stories\/([\w-]+)$/))) {
    const b = store.updateBug(match[1], req.body as object);
    res = b ? of(ok(req, b, 'Bug story saved')) : fail(req, 404, `Bug story ${match[1]} not found`);
  } else if (req.method === 'GET' && path === '/test-cases') {
    res = of(ok(req, store.listTests(req.params.get('clusterId') ?? undefined)));
  } else {
    res = fail(req, 404, `No mock handler for ${req.method} ${path}`);
  }
  return res.pipe(delayed());
};

function upload(req: HttpRequest<unknown>, store: MockStore): Observable<HttpEvent<unknown>> {
  const file = (req.body as FormData | null)?.get('file');
  if (!(file instanceof File)) return fail(req, 400, 'Multipart field "file" is required');
  const progress = timer(0, 120).pipe(
    take(6),
    map((i): HttpEvent<unknown> => ({ type: HttpEventType.UploadProgress, loaded: i * 20, total: 100 })),
  );
  const process = defer(() =>
    from(file.text()).pipe(
      delayed(),
      switchMap((text) => {
        try {
          const result = store.ingest(parseLogContent(text, file.name), file.name);
          return of<HttpEvent<unknown>>(ok(req, result, 'Logs processed'));
        } catch (e) {
          return fail(req, 422, `Unable to parse ${file.name}: ${(e as Error).message}`);
        }
      }),
    ),
  );
  return concat(progress, process);
}

import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoadingService } from '../services/loading.service';
import { NotificationService } from '../services/notification.service';

/** Set on a request to opt out of the global progress bar (e.g. uploads with their own progress UI). */
export const SKIP_LOADING = new HttpContextToken<boolean>(() => false);
/** Set on a request to handle its error locally instead of showing a toast. */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

const isApi = (url: string) => url.startsWith(environment.apiBaseUrl + '/');

/** Adds standard headers and a correlation id to API calls. Auth tokens would be attached here. */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApi(req.url)) return next(req);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Correlation-Id': crypto.randomUUID(),
  };
  // const token = inject(AuthService).accessToken(); if (token) headers['Authorization'] = `Bearer ${token}`;
  return next(req.clone({ setHeaders: headers }));
};

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApi(req.url) || req.context.get(SKIP_LOADING)) return next(req);
  const loading = inject(LoadingService);
  loading.start();
  return next(req).pipe(finalize(() => loading.stop()));
};

/** Normalises every HTTP failure to an ApiError and shows a toast. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifier = inject(NotificationService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) return throwError(() => err);
      const body = err.error as { message?: string; errors?: string[] } | null;
      const message =
        err.status === 0 || (!body?.message && (err.status === 502 || err.status === 504))
          ? environment.production
            ? 'Cannot reach the server. Check your connection and try again.'
            : 'Cannot reach the API server. Is it running? Start it with "npm run dev" (or "npm run api").'
          : body?.message ||
            (err.status >= 500 ? 'The server encountered an error. Please try again later.' : `Request failed (${err.status}).`);
      if (!req.context.get(SKIP_ERROR_TOAST)) notifier.error(message);
      return throwError(() => new ApiError(message, err.status, body?.errors ?? []));
    }),
  );
};

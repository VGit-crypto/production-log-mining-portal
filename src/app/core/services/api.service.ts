import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { APIResponse } from '../../models';

/** Thin typed wrapper over HttpClient that prefixes the base URL and unwraps APIResponse<T>. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  get<T>(path: string, params?: Record<string, string | undefined>, context?: HttpContext): Observable<T> {
    let p = new HttpParams();
    Object.entries(params ?? {}).forEach(([k, v]) => v !== undefined && (p = p.set(k, v)));
    return this.http.get<APIResponse<T>>(this.base + path, { params: p, context }).pipe(map((r) => r.data));
  }

  post<T>(path: string, body: unknown = {}, context?: HttpContext): Observable<T> {
    return this.http.post<APIResponse<T>>(this.base + path, body, { context }).pipe(map((r) => r.data));
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<APIResponse<T>>(this.base + path, body).pipe(map((r) => r.data));
  }
}

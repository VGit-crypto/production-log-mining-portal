import { HttpClient, HttpContext, HttpEventType } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { filter, map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SKIP_LOADING } from '../core/interceptors/interceptors';
import { APIResponse, UploadResult } from '../models';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  recordCount?: number;
}

export type UploadEvent =
  | { status: 'progress'; percent: number }
  | { status: 'done'; result: UploadResult };

@Injectable({ providedIn: 'root' })
export class LogUploadService {
  private readonly http = inject(HttpClient);
  private readonly cfg = environment.upload;

  /** Validates extension, size and content (JSON array/object or NDJSON) before anything is sent. */
  async validateFile(file: File): Promise<ValidationResult> {
    const name = file.name.toLowerCase();
    const ext = this.cfg.acceptedExtensions.find((e) => name.endsWith(e));
    if (!ext) return { valid: false, error: `"${file.name}": only ${this.cfg.acceptedExtensions.join(' and ')} files are accepted.` };
    if (file.size === 0) return { valid: false, error: `"${file.name}" is empty.` };
    if (file.size > this.cfg.maxFileSizeMb * 1024 * 1024) {
      return { valid: false, error: `"${file.name}" exceeds the ${this.cfg.maxFileSizeMb} MB limit.` };
    }
    const text = await file.text();
    return ext === '.ndjson' ? this.validateNdjson(text, file.name) : this.validateJson(text, file.name);
  }

  upload(file: File): Observable<UploadEvent> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http
      .post<APIResponse<UploadResult>>(`${environment.apiBaseUrl}/logs/upload`, form, {
        reportProgress: true,
        observe: 'events',
        context: new HttpContext().set(SKIP_LOADING, true),
      })
      .pipe(
        filter((e) => e.type === HttpEventType.UploadProgress || e.type === HttpEventType.Response),
        map((e): UploadEvent => {
          if (e.type === HttpEventType.Response) return { status: 'done', result: e.body!.data };
          const p = e.type === HttpEventType.UploadProgress && e.total ? Math.round((100 * e.loaded) / e.total) : 0;
          return { status: 'progress', percent: Math.min(p, 99) };
        }),
      );
  }

  private validateJson(text: string, name: string): ValidationResult {
    try {
      const parsed: unknown = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : this.findArray(parsed);
      if (!list && (typeof parsed !== 'object' || parsed === null)) {
        return { valid: false, error: `"${name}" must contain a JSON array or object of log records.` };
      }
      return { valid: true, recordCount: list?.length ?? 1 };
    } catch (e) {
      return { valid: false, error: `"${name}" is not valid JSON: ${(e as Error).message}` };
    }
  }

  private validateNdjson(text: string, name: string): ValidationResult {
    const lines = text.split(/\r?\n/);
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      try {
        const v: unknown = JSON.parse(lines[i]);
        if (typeof v !== 'object' || v === null) throw new Error('line is not a JSON object');
        count++;
      } catch (e) {
        return { valid: false, error: `"${name}" line ${i + 1} is invalid: ${(e as Error).message}` };
      }
    }
    return count ? { valid: true, recordCount: count } : { valid: false, error: `"${name}" has no log records.` };
  }

  private findArray(obj: unknown): unknown[] | null {
    if (!obj || typeof obj !== 'object') return null;
    for (const k of ['logs', 'records', 'entries', 'events', 'items', 'data']) {
      const v = (obj as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v;
    }
    return null;
  }
}

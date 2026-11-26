import { HttpContext } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { SKIP_ERROR_TOAST } from '../core/interceptors/interceptors';
import { FileInfo } from '../models';

const KEY = 'lmp.fileScope';

/** The selection is remembered in this browser only; it is a per-viewer convenience, not shared state. */
function readStored(): Set<string> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? new Set(list.map(String)) : null;
  } catch {
    return null;
  }
}

function writeStored(value: Set<string> | null): void {
  try {
    if (value === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify([...value]));
  } catch {
    /* storage unavailable: the selection lasts for this page only */
  }
}

/**
 * Which uploaded files the whole portal shows. `selected` null means every file. Pages reload their data whenever
 * `version` changes, and the HTTP layer adds `?files=` to data requests while a subset is selected.
 */
@Injectable({ providedIn: 'root' })
export class FileScopeService {
  private readonly api = inject(ApiService);

  readonly files = signal<FileInfo[]>([]);
  readonly selected = signal<Set<string> | null>(readStored());
  /** Increases on every selection change and every file-list refresh. */
  readonly version = signal(0);

  /** Number of files currently selected (files that no longer exist are not counted). */
  readonly selectedCount = computed(() => {
    const ids = this.files().map((f) => f.id);
    const s = this.selected();
    return s === null ? ids.length : ids.filter((id) => s.has(id)).length;
  });

  readonly label = computed(() => {
    const total = this.files().length;
    if (!total) return 'No files';
    if (this.selected() === null || this.selectedCount() === total) return `All files (${total})`;
    if (this.selectedCount() === 0) return 'No files selected';
    return `${this.selectedCount()} of ${total} files`;
  });

  /** Value for the ?files= query parameter; null when every file is selected. */
  readonly param = computed(() => {
    const s = this.selected();
    return s === null ? null : [...s].join(',');
  });

  isSelected(id: string): boolean {
    const s = this.selected();
    return s === null || s.has(id);
  }

  toggle(id: string): void {
    const ids = this.files().map((f) => f.id);
    const next = new Set(this.selected() ?? ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const allOn = ids.every((x) => next.has(x));
    this.apply(allOn ? null : next);
  }

  selectAll(): void {
    this.apply(null);
  }

  selectNone(): void {
    this.apply(new Set());
  }

  /** Reloads the file list, drops selected ids that no longer exist, and tells the pages to reload. */
  refresh(): void {
    this.api.get<FileInfo[]>('/files', undefined, new HttpContext().set(SKIP_ERROR_TOAST, true)).subscribe({
      next: (list) => this.receive(list),
      error: () => this.receive([]),
    });
  }

  deleteFiles(ids: string[]): Observable<unknown> {
    return this.api.post('/files/delete', { ids });
  }

  clearAll(): Observable<unknown> {
    return this.api.delete('/data');
  }

  private receive(list: FileInfo[]): void {
    this.files.set(list);
    const s = this.selected();
    if (s !== null) {
      const known = new Set(list.map((f) => f.id));
      const pruned = new Set([...s].filter((id) => known.has(id)));
      // Deleting the selected files must not leave the view empty: fall back to all remaining files.
      if (pruned.size !== s.size) this.apply(pruned.size ? pruned : null, false);
    }
    this.version.update((v) => v + 1);
  }

  private apply(next: Set<string> | null, bump = true): void {
    this.selected.set(next);
    writeStored(next);
    if (bump) this.version.update((v) => v + 1);
  }
}

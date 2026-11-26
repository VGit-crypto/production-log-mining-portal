import { DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { Observable } from 'rxjs';
import { FileScopeService } from '../../services/file-scope.service';

/**
 * Signal-based loader for page data. Pairs with <app-error-boundary> to give each page
 * loading / error / retry handling. Reloads automatically when the file selection changes.
 * Must be created in an injection context.
 */
export function createLoader<T>(source: () => Observable<T>, autoLoad = true) {
  const destroyRef = inject(DestroyRef);
  const scope = inject(FileScopeService);
  const data = signal<T | null>(null);
  const loading = signal(false);
  const error = signal<string | null>(null);
  let sub: { unsubscribe(): void } | undefined;

  const load = () => {
    sub?.unsubscribe();
    loading.set(true);
    error.set(null);
    sub = source().subscribe({
      next: (v) => {
        data.set(v);
        loading.set(false);
      },
      error: (e: Error) => {
        error.set(e.message || 'Failed to load data.');
        loading.set(false);
      },
    });
  };
  destroyRef.onDestroy(() => sub?.unsubscribe());

  // Reload whenever the file selection changes after the version this loader last loaded for.
  let loadedFor = untracked(() => scope.version());
  effect(() => {
    const v = scope.version();
    untracked(() => {
      if (v !== loadedFor) {
        loadedFor = v;
        load();
      }
    });
  });

  if (autoLoad) load();
  return { data, loading, error, load };
}

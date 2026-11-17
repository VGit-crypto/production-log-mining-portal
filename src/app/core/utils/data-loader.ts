import { DestroyRef, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Signal-based loader for page data. Pairs with <app-error-boundary> to give each page
 * loading / error / retry handling. Must be created in an injection context.
 */
export function createLoader<T>(source: () => Observable<T>, autoLoad = true) {
  const destroyRef = inject(DestroyRef);
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
  if (autoLoad) load();
  return { data, loading, error, load };
}

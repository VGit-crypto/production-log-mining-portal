import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { debounceTime, distinctUntilChanged, Subject, Subscription } from 'rxjs';
import { LogEntry, OccurrencePage, OccurrenceQuery, OccurrenceSort } from '../../models';
import { ErrorClusterService } from '../../services/error-cluster.service';

/**
 * Every individual error log record behind a cluster's frequency, with server-side search, sorting and paging.
 * Rows expand to show the full message, error / stack trace and request details.
 */
@Component({
  selector: 'app-cluster-occurrences',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe, DecimalPipe, MatTableModule, MatSortModule, MatPaginatorModule,
    MatFormFieldModule, MatInputModule, MatIconModule, MatButtonModule,
  ],
  templateUrl: './cluster-occurrences.component.html',
  styles: `
    .toolbar { display: flex; gap: 16px; align-items: baseline; flex-wrap: wrap; }
    .toolbar .grow { flex: 1 1 280px; }
    .count { color: var(--app-muted); }
    .note { background: #fff8e1; color: #6b5000; padding: 10px 14px; border-radius: 8px; margin: 0 0 12px; }
    .error { background: #fdecea; color: #8c1d18; padding: 10px 14px; border-radius: 8px; display: flex; gap: 12px; align-items: center; }
    .table-wrap { position: relative; }
    .scroll { overflow-x: auto; border: 1px solid var(--app-border); border-radius: 8px; }
    .empty { padding: 24px; text-align: center; color: var(--app-muted); }
    .loading { position: absolute; inset: 0; background: rgba(255, 255, 255, .6); display: grid; place-items: center; z-index: 2; color: var(--app-muted); }
    td.mat-mdc-cell, th.mat-mdc-header-cell { padding-left: 12px; padding-right: 12px; }
    .col-toggle { width: 48px; padding: 0 4px !important; }
    .col-time { white-space: nowrap; }
    .col-cid { white-space: nowrap; font-size: 12px; }
    .col-msg { min-width: 200px; max-width: 300px; }
    .col-err { min-width: 140px; max-width: 220px; color: var(--app-muted); }
    .clip { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .lv { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; border: 1px solid currentColor; }
    .lv-error { color: #8c1d18; background: #fdecea; }
    .lv-fatal { color: #fff; background: #8c1d18; border-color: #8c1d18; }
    .lv-warn { color: #6b5000; background: #fff8e1; }
    .lv-other { color: #37474f; background: #eceff1; }
    .status { font-weight: 600; font-variant-numeric: tabular-nums; }
    .none { color: #8a97a8; }
    tr.detail-row { height: 0; }
    .detail { overflow: hidden; }
    .detail-inner { padding: 12px 16px 16px 60px; background: #f7f9fd; border-top: 1px solid var(--app-border); }
    .detail h3 { margin: 12px 0 4px; font-size: 13px; color: var(--app-muted); font-weight: 600; }
    .detail p { margin: 0; overflow-wrap: anywhere; }
    .detail pre { margin: 0; background: #fff; border: 1px solid var(--app-border); border-radius: 6px; padding: 10px; overflow-x: auto; max-height: 260px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .detail dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px 16px; margin: 0; }
    .detail dt { color: var(--app-muted); font-size: 12px; }
    .detail dd { margin: 0; overflow-wrap: anywhere; }
    tr.row-main:hover { background: #f1f5fb; }
  `,
})
export class ClusterOccurrencesComponent {
  readonly clusterId = input.required<string>();
  /** Frequency the cluster reports; used to explain when fewer records are stored. */
  readonly expected = input.required<number>();

  private readonly svc = inject(ErrorClusterService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly columns = ['toggle', 'timestamp', 'level', 'statusCode', 'phase', 'message', 'error', 'correlationId'];
  protected readonly pageSizes = [10, 25, 50, 100];

  protected readonly query = signal<OccurrenceQuery>({ page: 0, pageSize: 25, sort: 'timestamp', dir: 'desc', q: '' });
  protected readonly data = signal<OccurrencePage | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly expandedId = signal<string | null>(null);

  private readonly search$ = new Subject<string>();
  private sub?: Subscription;

  constructor() {
    effect(() => {
      const id = this.clusterId();
      const q = this.query();
      untracked(() => this.load(id, q));
    });
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((text) => this.query.update((q) => ({ ...q, q: text, page: 0 })));
    this.destroyRef.onDestroy(() => this.sub?.unsubscribe());
  }

  protected reload(): void {
    this.load(this.clusterId(), this.query());
  }

  protected onSearch(value: string): void {
    this.search$.next(value.trim());
  }

  protected onPage(e: PageEvent): void {
    this.query.update((q) => ({ ...q, page: e.pageIndex, pageSize: e.pageSize }));
  }

  protected onSort(s: Sort): void {
    this.query.update((q) => ({
      ...q,
      sort: (s.direction ? s.active : 'timestamp') as OccurrenceSort,
      dir: s.direction === 'asc' ? 'asc' : 'desc',
      page: 0,
    }));
  }

  protected toggle(e: LogEntry): void {
    this.expandedId.update((id) => (id === e.id ? null : e.id));
  }

  protected levelClass(level: string): string {
    return level === 'ERROR' ? 'lv-error' : level === 'FATAL' ? 'lv-fatal' : level === 'WARN' ? 'lv-warn' : 'lv-other';
  }

  /** First line of an error / stack trace, for the compact table cell. */
  protected firstLine(e: LogEntry): string {
    return (e.error ?? e.stackTrace ?? '').split(/\r?\n/)[0];
  }

  private load(id: string, q: OccurrenceQuery): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.sub = this.svc.getOccurrences(id, q).subscribe({
      next: (page) => {
        this.data.set(page);
        this.loading.set(false);
        this.expandedId.set(null);
      },
      error: (e: Error) => {
        this.error.set(e.message || 'Could not load the occurrences.');
        this.loading.set(false);
      },
    });
  }
}

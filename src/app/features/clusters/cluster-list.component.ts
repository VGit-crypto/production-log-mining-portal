import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { createLoader } from '../../core/utils/data-loader';
import { ErrorCluster, SEVERITIES, Severity } from '../../models';
import { ErrorClusterService } from '../../services/error-cluster.service';
import {
  EmptyStateComponent,
  ErrorBoundaryComponent,
  PageHeaderComponent,
  SeverityChipComponent,
} from '../../shared/components/components';

const RANK: Record<Severity, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

@Component({
  selector: 'app-cluster-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe, DecimalPipe, RouterLink,
    MatTableModule, MatSortModule, MatPaginatorModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule,
    MatButtonModule, MatChipsModule, MatDatepickerModule,
    PageHeaderComponent, SeverityChipComponent, ErrorBoundaryComponent, EmptyStateComponent,
  ],
  templateUrl: './cluster-list.component.html',
  styles: `
    .panel { display: grid; gap: 16px; padding: 16px 24px; margin-bottom: 24px; background: var(--app-surface);
      border-radius: var(--app-radius); box-shadow: var(--app-shadow); }
    /* All filters stay on one row; the search box absorbs the slack, and the row only wraps on phone widths. */
    .fields { display: flex; gap: 16px; flex-wrap: nowrap; align-items: center; }
    .fields .grow { flex: 1 1 0; min-width: 120px; }
    .fields .select { flex: 0 1 184px; min-width: 120px; }
    .fields .dates { flex: 0 1 264px; min-width: 208px; }
    @media (max-width: 760px) { .fields { flex-wrap: wrap; } .fields .grow, .fields .select, .fields .dates { flex: 1 1 100%; } }
    .active { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 16px; border-top: 1px solid var(--n-100); }
    .active .count { margin-left: auto; font-size: 12px; font-weight: 500; color: var(--n-500); }
    .row { cursor: pointer; }
    .sig { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--n-900); font-weight: 500; }
    .nowrap, a.mono { white-space: nowrap; }
    .empty { padding: 32px; text-align: center; color: var(--app-muted); }
    a { color: var(--app-primary); font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
  `,
})
export class ClusterListComponent {
  private readonly router = inject(Router);
  private readonly svc = inject(ErrorClusterService);
  protected readonly clusters = createLoader(() => this.svc.getClusters());

  protected readonly columns = ['id', 'signature', 'category', 'severity', 'occurrences', 'lastSeen'];
  protected readonly severities = SEVERITIES;
  protected readonly search = signal('');
  protected readonly severity = signal<Severity[]>([]);
  protected readonly category = signal<string[]>([]);
  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly ds = new MatTableDataSource<ErrorCluster>([]);

  private readonly sort = viewChild(MatSort);
  private readonly paginator = viewChild(MatPaginator);

  protected readonly categories = computed(() => [...new Set((this.clusters.data() ?? []).map((c) => c.category))].sort());
  protected readonly hasDates = computed(() => !!this.from() || !!this.to());
  protected readonly activeCount = computed(
    () => (this.search().trim() ? 1 : 0) + this.severity().length + this.category().length + (this.hasDates() ? 1 : 0),
  );
  protected readonly dateChip = computed(() => {
    const f = this.from();
    const t = this.to();
    const d = (x: Date) => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return f && t ? `${d(f)} – ${d(t)}` : f ? `from ${d(f)}` : t ? `until ${d(t)}` : '';
  });

  private readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sev = this.severity();
    const cat = this.category();
    const from = this.from()?.getTime();
    const to = this.to() ? this.to()!.getTime() + 24 * 60 * 60 * 1000 - 1 : undefined; // inclusive end day
    return (this.clusters.data() ?? []).filter((c) => {
      const t = Date.parse(c.lastSeen);
      return (
        (!sev.length || sev.includes(c.severity)) &&
        (!cat.length || cat.includes(c.category)) &&
        (from === undefined || t >= from) &&
        (to === undefined || t <= to) &&
        (!q || `${c.id} ${c.reportBugTitle ?? ''} ${c.signature} ${c.module} ${c.category}`.toLowerCase().includes(q))
      );
    });
  });
  protected readonly resultCount = computed(() => this.filtered().length);
  protected readonly total = computed(() => this.clusters.data()?.length ?? 0);

  constructor() {
    this.ds.sortingDataAccessor = (c, col) =>
      col === 'severity' ? RANK[c.severity] : col === 'signature' ? (c.reportBugTitle ?? c.signature) : (c as never)[col];
    effect(() => {
      this.ds.data = this.filtered();
      this.ds.paginator?.firstPage();
    });
    effect(() => {
      this.ds.sort = this.sort() ?? null;
      this.ds.paginator = this.paginator() ?? null;
    });
  }

  protected removeSeverity(s: Severity): void {
    this.severity.update((list) => list.filter((x) => x !== s));
  }

  protected removeCategory(c: string): void {
    this.category.update((list) => list.filter((x) => x !== c));
  }

  protected clearDates(): void {
    this.from.set(null);
    this.to.set(null);
  }

  protected clearAll(): void {
    this.search.set('');
    this.severity.set([]);
    this.category.set([]);
    this.clearDates();
  }

  protected open(c: ErrorCluster): void {
    void this.router.navigate(['/clusters', c.id]);
  }
}

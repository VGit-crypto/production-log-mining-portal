import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
    DatePipe, DecimalPipe, PercentPipe, RouterLink,
    MatTableModule, MatSortModule, MatPaginatorModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule,
    PageHeaderComponent, SeverityChipComponent, ErrorBoundaryComponent, EmptyStateComponent,
  ],
  templateUrl: './cluster-list.component.html',
  styles: `
    .row { cursor: pointer; }
    .row:hover { background: #f1f5fb; }
    .sig { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .empty { padding: 24px; text-align: center; color: var(--app-muted); }
    a { color: var(--app-primary); font-weight: 500; }
  `,
})
export class ClusterListComponent {
  private readonly router = inject(Router);
  private readonly svc = inject(ErrorClusterService);
  protected readonly clusters = createLoader(() => this.svc.getClusters());

  protected readonly columns = ['id', 'signature', 'category', 'severity', 'occurrences', 'lastSeen', 'confidenceScore'];
  protected readonly severities = SEVERITIES;
  protected readonly search = signal('');
  protected readonly severity = signal<Severity | ''>('');
  protected readonly category = signal('');
  protected readonly ds = new MatTableDataSource<ErrorCluster>([]);

  private readonly sort = viewChild(MatSort);
  private readonly paginator = viewChild(MatPaginator);

  protected readonly categories = computed(() => [...new Set((this.clusters.data() ?? []).map((c) => c.category))].sort());
  private readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return (this.clusters.data() ?? []).filter(
      (c) =>
        (!this.severity() || c.severity === this.severity()) &&
        (!this.category() || c.category === this.category()) &&
        (!q || `${c.id} ${c.signature} ${c.module} ${c.category}`.toLowerCase().includes(q)),
    );
  });

  constructor() {
    this.ds.sortingDataAccessor = (c, col) => (col === 'severity' ? RANK[c.severity] : (c as never)[col]);
    effect(() => {
      this.ds.data = this.filtered();
      this.ds.paginator?.firstPage();
    });
    effect(() => {
      this.ds.sort = this.sort() ?? null;
      this.ds.paginator = this.paginator() ?? null;
    });
  }

  protected open(c: ErrorCluster): void {
    void this.router.navigate(['/clusters', c.id]);
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal, viewChild } from '@angular/core';
import { catchError, EMPTY, switchMap, timer } from 'rxjs';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { NotificationService } from '../../core/services/notification.service';
import { createLoader } from '../../core/utils/data-loader';
import { PipelineStatus, Severity, TestCase } from '../../models';
import { ExportService } from '../../services/export.service';
import { TestCaseService } from '../../services/test-case.service';
import {
  EmptyStateComponent,
  ErrorBoundaryComponent,
  PageHeaderComponent,
  SeverityChipComponent,
} from '../../shared/components/components';

const RANK: Record<Severity, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
// (the AI agent only emits High / Medium / Low priorities)

@Component({
  selector: 'app-test-cases',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    PageHeaderComponent, SeverityChipComponent, ErrorBoundaryComponent, EmptyStateComponent,
  ],
  templateUrl: './test-cases.component.html',
  styles: `
    .banner { display: flex; gap: 8px; align-items: center; background: #eef0ff; color: var(--app-navy); padding: 10px 14px; border-radius: 8px; margin: 0 0 16px; }
    .banner.warn { background: #fef3c7; color: #92400e; }
    .search { display: block; width: min(100%, 420px); margin: 0 0 24px; }
    td { vertical-align: top; padding-top: 12px !important; padding-bottom: 12px !important; }
    ul, ol { margin: 0; padding-left: 18px; }
    .nowrap { white-space: nowrap; }
    .wide { min-width: 220px; }
    td { line-height: 1.55; font-size: 13.5px; }
    td:nth-child(3) { min-width: 220px; }
    td:nth-child(4) { min-width: 380px; }
    td:nth-child(5) { min-width: 300px; }
    .empty { padding: 24px; text-align: center; color: var(--app-muted); }
  `,
})
export class TestCasesComponent {
  private readonly exporter = inject(ExportService);
  private readonly notify = inject(NotificationService);
  private readonly svc = inject(TestCaseService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly tests = createLoader(() => this.svc.getAll());
  protected readonly status = signal<PipelineStatus>({ pendingClusters: 0, failedClusters: 0 });
  protected readonly columns = ['id', 'scenario', 'preconditions', 'steps', 'expectedResults', 'priority'];
  protected readonly ds = new MatTableDataSource<TestCase>([]);
  protected readonly query = signal('');

  private readonly sort = viewChild(MatSort);
  private readonly paginator = viewChild(MatPaginator);

  constructor() {
    this.ds.sortingDataAccessor = (t, col) => (col === 'priority' ? RANK[t.priority] : (t as never)[col]);
    this.ds.filterPredicate = (t, q) =>
      [t.id, t.scenario, ...t.preconditions, ...t.steps, ...t.expectedResults].join(' ').toLowerCase().includes(q);
    effect(() => (this.ds.data = this.tests.data() ?? []));

    // Poll background AI generation; refresh the list whenever the pending count drops.
    const poll = timer(0, 5000)
      .pipe(switchMap(() => this.svc.getStatus().pipe(catchError(() => EMPTY))))
      .subscribe((s) => {
        const before = this.status().pendingClusters;
        this.status.set(s);
        if (before > s.pendingClusters) this.tests.load();
      });
    this.destroyRef.onDestroy(() => poll.unsubscribe());
    effect(() => {
      this.ds.sort = this.sort() ?? null;
      this.ds.paginator = this.paginator() ?? null;
    });
  }

  protected filter(value: string): void {
    this.ds.filter = value.trim().toLowerCase();
    this.ds.paginator?.firstPage();
  }

  /** Exports honour the current search filter. */
  protected csv(): void {
    this.exporter.exportTestCasesCsv(this.ds.filteredData);
    this.notify.success('CSV exported.');
  }

  protected async excel(): Promise<void> {
    await this.exporter.exportTestCasesExcel(this.ds.filteredData);
    this.notify.success('Excel file exported.');
  }
}

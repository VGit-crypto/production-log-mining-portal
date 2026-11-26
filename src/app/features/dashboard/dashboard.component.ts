import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { NotificationService } from '../../core/services/notification.service';
import { createLoader } from '../../core/utils/data-loader';
import { CountBucket, Severity } from '../../models';
import { DashboardService } from '../../services/dashboard.service';
import { FileScopeService } from '../../services/file-scope.service';
import { ErrorClusterService } from '../../services/error-cluster.service';
import { BarChartComponent, DonutChartComponent } from '../../shared/charts/charts';
import {
  ConfirmDialogComponent,
  EmptyStateComponent,
  ErrorBoundaryComponent,
  KpiTrend,
  PageHeaderComponent,
  StatCardComponent,
  TimelineComponent,
  TimelineItem,
} from '../../shared/components/components';

const SEVERITY_ICON: Record<Severity, string> = { Critical: 'error', High: 'warning', Medium: 'info', Low: 'check_circle' };

const pct = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);
const fmt = (n: number): string => `${n >= 10 || n === 0 ? Math.round(n) : parseFloat(n.toFixed(1))}%`;

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, MatButtonModule, MatCardModule, MatIconModule, MatCheckboxModule, MatMenuModule, DecimalPipe,
    PageHeaderComponent, StatCardComponent, ErrorBoundaryComponent, EmptyStateComponent, TimelineComponent,
    BarChartComponent, DonutChartComponent,
  ],
  templateUrl: './dashboard.component.html',
  styles: `
    /* Row 1: three totals. Row 2: the four severity levels. */
    .totals { grid-template-columns: repeat(3, 1fr); margin-bottom: 24px; }
    .severities { grid-template-columns: repeat(4, 1fr); }
    .chart-grid { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); }
    @media (max-width: 1000px) { .chart-grid { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 1100px) { .totals { grid-template-columns: repeat(2, 1fr); } .severities { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 640px) { .totals, .severities { grid-template-columns: 1fr; } }
    mat-card-header { padding: 24px 24px 0; display: grid; gap: 4px; }
    mat-card-content { padding: 24px; }
    .muted { margin: 0; color: var(--n-500); }
    .all { margin: 16px 0 -8px -12px; }
    .clear-btn { --mat-button-outlined-label-text-color: #b91c1c; --mat-button-outlined-outline-color: #fca5a5; }
    .clear-btn:hover:not(:disabled) { --mat-button-outlined-outline-color: #ef4444; background: #fee2e2; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `,
})
export class DashboardComponent {
  private readonly svc = inject(DashboardService);
  private readonly clusterSvc = inject(ErrorClusterService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);
  protected readonly metrics = createLoader(() => this.svc.getMetrics());
  private readonly clusters = createLoader(() => this.clusterSvc.getClusters());
  protected readonly clearing = signal(false);
  protected readonly scope = inject(FileScopeService);
  protected readonly hasFiles = computed(() => this.scope.files().length > 0);
  /** Files ticked in the Clear menu, to delete together. */
  protected readonly marked = signal<Set<string>>(new Set());

  protected isMarked(id: string): boolean {
    return this.marked().has(id);
  }

  protected mark(id: string): void {
    const next = new Set(this.marked());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.marked.set(next);
  }

  /** Asks for confirmation, then deletes only the ticked files and their clusters, bug stories and test cases. */
  protected confirmDeleteSelected(): void {
    const ids = [...this.marked()];
    const names = this.scope.files().filter((f) => ids.includes(f.id)).map((f) => f.fileName);
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: `Delete ${ids.length} file${ids.length === 1 ? '' : 's'}?`,
          message: `${names.join(', ')} will be removed. Clusters that only came from these files are removed too. A backup copy is kept on the server.`,
          confirmText: 'Delete files',
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.clearing.set(true);
        this.scope.deleteFiles(ids).subscribe({
          next: () => {
            this.clearing.set(false);
            this.marked.set(new Set());
            this.notify.success(`Deleted ${ids.length} file${ids.length === 1 ? '' : 's'}.`);
            this.scope.refresh();
          },
          error: () => this.clearing.set(false),
        });
      });
  }

  /** Asks for confirmation, then deletes every stored upload, cluster, bug story and test case. */
  protected confirmClear(): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Clear all data?',
          message:
            'This deletes every uploaded log, error cluster, bug story and test case shown in the portal. A backup copy of the data is kept on the server. This cannot be undone from the portal.',
          confirmText: 'Clear data',
        },
      })
      .afterClosed()
      .subscribe((ok) => ok && this.clear());
  }

  private clear(): void {
    this.clearing.set(true);
    this.svc.clearAll().subscribe({
      next: () => {
        this.clearing.set(false);
        this.notify.success('All data cleared.');
        this.marked.set(new Set());
        this.scope.selectAll();
        this.scope.refresh();
      },
      error: () => this.clearing.set(false),
    });
  }

  /**
   * KPI indicators computed from real data only: day-over-day change when at least two days of errors exist,
   * otherwise nothing; severity cards show their share of all errors.
   */
  protected readonly kpi = computed(() => {
    const m = this.metrics.data();
    const none: KpiTrend | null = null;
    if (!m) return { errors: none, errorsHint: '', clustersHint: '', critical: none, high: none, medium: none, low: none };

    const share = (n: number): KpiTrend => ({ label: fmt(pct(n, m.totalErrors)), direction: 'none', tone: 'neutral' });
    const t = m.trend;
    let errors: KpiTrend | null = null;
    if (t.length >= 2 && t[t.length - 2].value > 0) {
      const change = ((t[t.length - 1].value - t[t.length - 2].value) / t[t.length - 2].value) * 100;
      errors = {
        label: `${change > 0 ? '+' : ''}${change.toFixed(1)}% vs previous day`,
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
        tone: change > 0 ? 'bad' : change < 0 ? 'good' : 'neutral',
      };
    }
    return {
      errors,
      errorsHint: `${pct(m.totalErrors, m.totalLogs).toFixed(1)}% of log records`,
      clustersHint: m.uniqueClusters ? `about ${Math.round(m.totalErrors / m.uniqueClusters)} errors per cluster` : '',
      critical: share(m.bySeverity.find((b) => b.label === 'Critical')?.value ?? 0),
      high: share(m.bySeverity.find((b) => b.label === 'High')?.value ?? 0),
      medium: share(m.bySeverity.find((b) => b.label === 'Medium')?.value ?? 0),
      low: share(m.bySeverity.find((b) => b.label === 'Low')?.value ?? 0),
    };
  });

  /** Error clusters per severity (Critical, High, Medium, Low). The donut's percentages are shares of this total. */
  protected readonly severityClusters = computed<CountBucket[]>(() => {
    const m = this.metrics.data();
    return [
      { label: 'Critical', value: m?.critical ?? 0 },
      { label: 'High', value: m?.high ?? 0 },
      { label: 'Medium', value: m?.medium ?? 0 },
      { label: 'Low', value: m?.low ?? 0 },
    ];
  });

  /** The six clusters with the most recent errors, newest first, as timeline events. */
  protected readonly activity = computed<TimelineItem[]>(() =>
    [...(this.clusters.data() ?? [])]
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, 6)
      .map((c) => ({
        title: c.reportBugTitle ?? c.signature,
        time: c.lastSeen,
        meta: `${c.context ?? c.module} · ${c.occurrences.toLocaleString()} occurrence${c.occurrences === 1 ? '' : 's'} · ${c.id}`,
        tone: c.severity.toLowerCase() as TimelineItem['tone'],
        icon: SEVERITY_ICON[c.severity],
        link: ['/clusters', c.id],
      })),
  );
}

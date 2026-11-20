import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { createLoader } from '../../core/utils/data-loader';
import { Severity } from '../../models';
import { DashboardService } from '../../services/dashboard.service';
import { ErrorClusterService } from '../../services/error-cluster.service';
import { BarChartComponent, DonutChartComponent } from '../../shared/charts/charts';
import {
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
    RouterLink, MatButtonModule, MatCardModule, MatIconModule,
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
  `,
})
export class DashboardComponent {
  private readonly svc = inject(DashboardService);
  private readonly clusterSvc = inject(ErrorClusterService);
  protected readonly metrics = createLoader(() => this.svc.getMetrics());
  private readonly clusters = createLoader(() => this.clusterSvc.getClusters());

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

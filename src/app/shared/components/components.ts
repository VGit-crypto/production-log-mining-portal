import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Severity } from '../../models';

@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-header.component.html',
  styles: `
    .ph { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 32px; }
    h1 { margin: 0; font-size: 28px; line-height: 36px; font-weight: 700; color: var(--n-900); }
    p { margin: 4px 0 0; color: var(--n-500); font-size: 14px; line-height: 20px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}

/** Pill badge with a soft background; the status color is on the dot, the text uses a darker shade for contrast. */
@Component({
  selector: 'app-severity-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './severity-chip.component.html',
  styles: `
    .chip { display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; line-height: 16px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .sev-critical { color: #b91c1c; background: #fee2e2; } .sev-critical .dot { background: #ef4444; }
    .sev-high { color: #b45309; background: #fef3c7; } .sev-high .dot { background: #f59e0b; }
    .sev-medium { color: #6d28d9; background: #f3e8ff; } .sev-medium .dot { background: #7c3aed; }
    .sev-low { color: #047857; background: #d1fae5; } .sev-low .dot { background: #10b981; }
  `,
})
export class SeverityChipComponent {
  readonly severity = input.required<Severity>();
}

export interface KpiTrend {
  label: string;
  direction: 'up' | 'down' | 'flat' | 'none';
  /** good = green, bad = red, neutral = grey. Whether "up" is good depends on the metric, so the caller decides. */
  tone: 'good' | 'bad' | 'neutral';
}

/** KPI widget: label, large value, colored icon tile, and an optional trend indicator with a short hint. */
@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatIconModule],
  templateUrl: './stat-card.component.html',
  styles: `
    :host { display: block; }
    .kpi { height: 100%; box-sizing: border-box; padding: 24px; display: grid; gap: 8px; }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .label { font-size: 14px; font-weight: 500; color: var(--n-500); }
    .ico { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--tint); color: var(--tone); }
    mat-icon { width: 22px; height: 22px; font-size: 22px; }
    .value { font-size: 32px; line-height: 40px; font-weight: 700; color: var(--n-900); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
    .foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 24px; font-size: 12px; font-weight: 500; color: var(--n-500); }
    .delta { display: inline-flex; align-items: center; gap: 2px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
    .delta mat-icon { width: 16px; height: 16px; font-size: 16px; }
    .delta.good { color: #047857; background: #d1fae5; }
    .delta.bad { color: #b91c1c; background: #fee2e2; }
    .delta.neutral { color: var(--n-700); background: var(--n-100); }
    .tone-default { --tone: #635bff; --tint: #eef0ff; }
    .tone-info { --tone: #0e7490; --tint: #cffafe; }
    .tone-success { --tone: #047857; --tint: #d1fae5; }
    .tone-critical { --tone: #dc2626; --tint: #fee2e2; }
    .tone-high { --tone: #d97706; --tint: #fef3c7; }
    .tone-medium { --tone: #7c3aed; --tint: #f3e8ff; }
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number | string>();
  readonly icon = input('analytics');
  readonly tone = input<'default' | 'info' | 'success' | 'critical' | 'high' | 'medium'>('default');
  readonly hint = input('');
  readonly trend = input<KpiTrend | null>(null);
  protected readonly arrow = computed(() => {
    const d = this.trend()?.direction;
    return d === 'up' ? 'trending_up' : d === 'down' ? 'trending_down' : d === 'flat' ? 'trending_flat' : '';
  });
}

export type TimelineTone = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success' | 'neutral';

export interface TimelineItem {
  title: string;
  /** ISO timestamp. */
  time: string;
  meta?: string;
  tone: TimelineTone;
  icon?: string;
  /** Router link for the title (e.g. to a cluster). */
  link?: string[];
}

/** Vertical operational timeline: a status marker per event on a rail, newest-first ordering is up to the caller. */
@Component({
  selector: 'app-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, MatIconModule],
  templateUrl: './timeline.component.html',
  styles: `
    .tl { list-style: none; margin: 0; padding: 0; }
    .item { display: grid; grid-template-columns: 40px 1fr; gap: 16px; animation: tl-in 250ms var(--app-ease) both; }
    .rail { display: flex; flex-direction: column; align-items: center; }
    .dot { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--tint); color: var(--tone); box-shadow: 0 0 0 4px #fff; }
    .dot mat-icon { width: 20px; height: 20px; font-size: 20px; }
    .line { flex: 1; width: 2px; margin: 4px 0; background: var(--n-200); border-radius: 1px; }
    .body { padding: 8px 0 24px; min-width: 0; }
    .item:last-child .body { padding-bottom: 0; }
    .row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .title { font-size: 14px; font-weight: 600; color: var(--n-900); overflow-wrap: anywhere; }
    .title a { color: inherit; text-decoration: none; }
    .title a:hover { color: var(--c-primary-strong); text-decoration: underline; }
    time { font-size: 12px; font-weight: 500; color: var(--n-500); white-space: nowrap; }
    .meta { margin: 2px 0 0; font-size: 12px; color: var(--n-500); }
    .tone-critical { --tone: #dc2626; --tint: #fee2e2; }
    .tone-high { --tone: #d97706; --tint: #fef3c7; }
    .tone-medium { --tone: #7c3aed; --tint: #f3e8ff; }
    .tone-low, .tone-success { --tone: #047857; --tint: #d1fae5; }
    .tone-info { --tone: #0e7490; --tint: #cffafe; }
    .tone-neutral { --tone: #475569; --tint: #f1f5f9; }
    @keyframes tl-in { from { opacity: 0; transform: translateY(6px); } }
  `,
})
export class TimelineComponent {
  readonly items = input.required<TimelineItem[]>();
  readonly label = input('Event timeline');
}

/**
 * Error boundary for page content: shows a spinner while loading, a retry panel on failure,
 * and projects the real content only when everything is fine.
 */
@Component({
  selector: 'app-error-boundary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './error-boundary.component.html',
  styles: `
    .state { display: grid; justify-items: center; gap: 8px; padding: 64px 24px; text-align: center; color: var(--n-500);
      background: var(--app-surface); border-radius: var(--app-radius); box-shadow: var(--app-shadow); }
    mat-icon { width: 48px; height: 48px; font-size: 48px; color: var(--c-danger); }
    h2 { margin: 0; color: var(--n-900); font-size: 20px; font-weight: 600; }
    p { margin: 0 0 8px; }
  `,
})
export class ErrorBoundaryComponent {
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly retry = output<void>();
}

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './empty-state.component.html',
  styles: `
    .empty { display: grid; justify-items: center; gap: 8px; padding: 64px 24px; text-align: center; color: var(--n-500);
      background: var(--app-surface); border-radius: var(--app-radius); box-shadow: var(--app-shadow); }
    mat-icon { width: 64px; height: 64px; font-size: 32px; display: grid; place-items: center; border-radius: 50%; background: var(--c-primary-soft); color: var(--c-primary-strong); }
    h2 { margin: 0; color: var(--n-900); font-size: 20px; font-weight: 600; }
    p { margin: 0 0 16px; }
  `,
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly message = input('');
}

export interface ConfirmData {
  title: string;
  message: string;
  confirmText?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './confirm-dialog.component.html',
})
export class ConfirmDialogComponent {
  protected readonly data = inject(MAT_DIALOG_DATA) as ConfirmData;
}

import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
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
    .ph { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 26px; font-weight: 600; color: var(--app-navy); }
    p { margin: 4px 0 0; color: var(--app-muted); }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}

@Component({
  selector: 'app-severity-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './severity-chip.component.html',
  styles: `
    .chip { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; border: 1px solid currentColor; }
    .sev-critical { color: #8c1d18; background: #fdecea; }
    .sev-high { color: #8a3b00; background: #fff1e5; }
    .sev-medium { color: #6b5000; background: #fff8e1; }
    .sev-low { color: #1b5e20; background: #e8f5e9; }
  `,
})
export class SeverityChipComponent {
  readonly severity = input.required<Severity>();
}

@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatIconModule],
  templateUrl: './stat-card.component.html',
  styles: `
    .stat { flex-direction: row; align-items: center; gap: 16px; padding: 18px 20px; border-left: 5px solid var(--tone, var(--app-primary)); }
    mat-icon { color: var(--tone, var(--app-primary)); width: 36px; height: 36px; font-size: 36px; }
    .value { font-size: 28px; font-weight: 700; line-height: 1.1; color: var(--app-navy); font-variant-numeric: tabular-nums; }
    .label { color: var(--app-muted); font-size: 14px; }
    .tone-critical { --tone: #b3261e; }
    .tone-high { --tone: #c75300; }
    .tone-medium { --tone: #8f6b00; }
    .tone-default { --tone: #1a4b8c; }
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number | string>();
  readonly icon = input('analytics');
  readonly tone = input<'default' | 'critical' | 'high' | 'medium'>('default');
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
    .state { display: grid; justify-items: center; gap: 8px; padding: 56px 16px; text-align: center; color: var(--app-muted); }
    mat-icon { width: 48px; height: 48px; font-size: 48px; color: #b3261e; }
    h2 { margin: 0; color: var(--app-navy); font-size: 18px; }
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
    .empty { display: grid; justify-items: center; gap: 6px; padding: 48px 16px; text-align: center; color: var(--app-muted); }
    mat-icon { width: 48px; height: 48px; font-size: 48px; color: #8a97a8; }
    h2 { margin: 0; color: var(--app-navy); font-size: 18px; }
    p { margin: 0 0 12px; }
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
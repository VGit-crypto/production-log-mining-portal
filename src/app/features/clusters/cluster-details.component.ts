import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { finalize, forkJoin } from 'rxjs';
import { ErrorCluster } from '../../models';
import { MarkdownViewComponent } from '../../shared/components/markdown-view.component';
import { ClusterOccurrencesComponent } from './cluster-occurrences.component';
import { FrequencyInfoData, FrequencyInfoDialogComponent } from './frequency-info-dialog.component';
import { NotificationService } from '../../core/services/notification.service';
import { createLoader } from '../../core/utils/data-loader';
import { BugStoryService } from '../../services/bug-story.service';
import { ErrorClusterService } from '../../services/error-cluster.service';
import { ExportService } from '../../services/export.service';
import { TestCaseService } from '../../services/test-case.service';
import {
  ConfirmDialogComponent,
  EmptyStateComponent,
  ErrorBoundaryComponent,
  PageHeaderComponent,
  SeverityChipComponent,
} from '../../shared/components/components';

@Component({
  selector: 'app-cluster-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe, DecimalPipe, PercentPipe, RouterLink,
    MatButtonModule, MatCardModule, MatIconModule, MatTabsModule, MatTableModule, MatTooltipModule,
    PageHeaderComponent, SeverityChipComponent, ErrorBoundaryComponent, EmptyStateComponent,
    ClusterOccurrencesComponent, MarkdownViewComponent,
  ],
  templateUrl: './cluster-details.component.html',
  styles: `
    td.mono { white-space: nowrap; }
    .k { display: flex; align-items: center; gap: 2px; }
    .info { --mat-icon-button-state-layer-size: 28px; width: 28px; height: 28px; padding: 2px; color: var(--app-primary); }
    .info mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .back { margin-bottom: 8px; }
    .busy { background: #e8f0fc; color: var(--app-navy); padding: 10px 14px; border-radius: 8px; margin: 0 0 12px; }
    .panel { padding: 24px 0; }
    h2 { font-size: 18px; color: var(--app-navy); margin: 24px 0 8px; }
    .facts { margin-bottom: 8px; }
    .k { color: var(--app-muted); font-size: 13px; margin-bottom: 6px; }
    .v { font-size: 18px; font-weight: 600; color: var(--app-navy); }
    .muted { color: var(--app-muted); }
    .sig { background: #f3f6fb; border-radius: 6px; padding: 10px 12px; }
    .sample { margin-bottom: 12px; }
    .meta { color: var(--app-muted); font-size: 13px; margin-bottom: 6px; }
    .stack { background: #f3f6fb; padding: 10px; border-radius: 6px; overflow-x: auto; margin: 8px 0 0; max-height: 220px; }
  `,
})
export class ClusterDetailsComponent {
  /** Bound from the :id route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  private readonly clusterSvc = inject(ErrorClusterService);
  private readonly bugSvc = inject(BugStoryService);
  private readonly testSvc = inject(TestCaseService);
  private readonly exporter = inject(ExportService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);

  protected readonly tab = signal(0);
  protected readonly busy = signal(false);
  protected readonly testColumns = ['id', 'scenario', 'priority'];

  protected readonly page = createLoader(
    () =>
      forkJoin({
        cluster: this.clusterSvc.getCluster(this.id()),
        bugs: this.bugSvc.getAll(this.id()),
        tests: this.testSvc.getAll(this.id()),
      }),
    false,
  );

  constructor() {
    effect(() => {
      this.id();
      untracked(() => this.page.load());
    });
  }

  protected generateBug(exists: boolean): void {
    if (!exists) return this.runBug(false);
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { title: 'Regenerate bug story?', message: 'This replaces the existing story, including any edits you made.', confirmText: 'Regenerate' },
      })
      .afterClosed()
      .subscribe((ok) => ok && this.runBug(true));
  }

  /** Header location: "<module> › <context>" (context = Service.method), falling back to the service or module. */
  protected locationLabel(c: ErrorCluster): string {
    const where = c.context ?? c.service ?? c.module;
    return c.appName ? `${c.appName} › ${where}` : where;
  }

  protected showFrequencyInfo(c: ErrorCluster): void {
    this.dialog.open<FrequencyInfoDialogComponent, FrequencyInfoData>(FrequencyInfoDialogComponent, {
      data: { occurrences: c.occurrences, groupBasis: c.groupBasis, groupKey: c.groupKey },
      width: '560px',
      maxWidth: '95vw',
    });
  }

  protected generateTests(): void {
    this.busy.set(true);
    this.testSvc
      .generate(this.id())
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe(() => {
        this.notify.success('Test cases generated.');
        this.tab.set(3);
        this.page.load();
      });
  }

  protected downloadMd(b: Parameters<ExportService['downloadBugStoryMarkdown']>[0]): void {
    this.exporter.downloadBugStoryMarkdown(b);
  }

  private runBug(force: boolean): void {
    this.busy.set(true);
    this.bugSvc
      .generate(this.id(), force)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe(() => {
        this.notify.success('Bug story generated.');
        this.tab.set(2);
        this.page.load();
      });
  }
}

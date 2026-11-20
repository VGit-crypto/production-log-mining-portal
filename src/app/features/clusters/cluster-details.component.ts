import { DecimalPipe } from '@angular/common';
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
import { BugStory, ErrorCluster } from '../../models';
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
  TimelineComponent,
  TimelineItem,
} from '../../shared/components/components';

@Component({
  selector: 'app-cluster-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe, RouterLink,
    MatButtonModule, MatCardModule, MatIconModule, MatTabsModule, MatTableModule, MatTooltipModule,
    PageHeaderComponent, SeverityChipComponent, ErrorBoundaryComponent, EmptyStateComponent,
    ClusterOccurrencesComponent, MarkdownViewComponent, TimelineComponent,
  ],
  templateUrl: './cluster-details.component.html',
  styles: `
    td.mono { white-space: nowrap; }
    .k { display: flex; align-items: center; gap: 2px; }
    .info { --mat-icon-button-state-layer-size: 28px; width: 28px; height: 28px; padding: 2px; color: var(--app-primary); }
    .info mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .back { margin-bottom: 8px; }
    .busy { background: var(--c-primary-soft); color: var(--c-primary-strong); font-weight: 500; padding: 12px 16px; border-radius: 12px; margin: 0 0 16px; }
    .panel { padding: 24px 0; }
    h2 { font-size: 20px; line-height: 28px; font-weight: 600; color: var(--n-900); margin: 32px 0 16px; }
    .facts { margin-bottom: 8px; }
    .facts mat-card-content { padding: 24px; }
    .k { color: var(--n-500); font-size: 12px; font-weight: 500; margin-bottom: 8px; }
    .v { font-size: 24px; line-height: 32px; font-weight: 700; color: var(--n-900); }
    .two-col { display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); align-items: start; }
    .two-col h2 { margin-top: 0; }
    .impact p { margin: 0; line-height: 1.6; color: var(--n-700); }
    mat-card-content.pad { padding: 24px; }
    .muted { color: var(--app-muted); }
    .sig { background: var(--n-100); border-radius: 8px; padding: 8px 16px; }
    .sample { margin-bottom: 12px; }
    .bug-desc { display: block; margin-top: 12px; }
    .meta { color: var(--app-muted); font-size: 13px; margin-bottom: 6px; }
    .stack { background: var(--n-100); padding: 16px; border-radius: 12px; overflow-x: auto; margin: 8px 0 0; max-height: 220px; }
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

  /** Operational timeline of a cluster, newest first: last error, generated bug stories, first error. */
  protected timelineFor(c: ErrorCluster, bugs: BugStory[]): TimelineItem[] {
    const place = c.context ?? c.service ?? c.module;
    const items: TimelineItem[] = [
      {
        title: 'Last error recorded',
        time: c.lastSeen,
        meta: `${c.occurrences.toLocaleString()} occurrence${c.occurrences === 1 ? '' : 's'} in total · ${place}`,
        tone: c.severity.toLowerCase() as TimelineItem['tone'],
        icon: 'flight_land',
      },
      ...bugs.map<TimelineItem>((b) => ({
        title: 'Bug story generated',
        time: b.createdAt,
        meta: b.id,
        tone: 'success',
        icon: 'bug_report',
      })),
      { title: 'First error recorded', time: c.firstSeen, meta: place, tone: 'info', icon: 'flight_takeoff' },
    ];
    return items.sort((a, b) => b.time.localeCompare(a.time));
  }
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

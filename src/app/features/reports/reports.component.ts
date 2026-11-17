import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../core/services/notification.service';
import { BugStoryService } from '../../services/bug-story.service';
import { ErrorClusterService } from '../../services/error-cluster.service';
import { ExportService } from '../../services/export.service';
import { TestCaseService } from '../../services/test-case.service';
import { PageHeaderComponent } from '../../shared/components/components';

type ReportId = 'analysis' | 'stories' | 'tests' | 'excel';

interface Report {
  id: ReportId;
  title: string;
  description: string;
  format: string;
  icon: string;
}

@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule, PageHeaderComponent],
  templateUrl: './reports.component.html',
  styles: `
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); }
    mat-icon[mat-card-avatar] { color: var(--app-primary); width: 40px; height: 40px; font-size: 40px; }
    mat-card-content { padding: 16px; }
  `,
})
export class ReportsComponent {
  private readonly clusters = inject(ErrorClusterService);
  private readonly stories = inject(BugStoryService);
  private readonly tests = inject(TestCaseService);
  private readonly exporter = inject(ExportService);
  private readonly notify = inject(NotificationService);

  protected readonly busy = signal<ReportId | null>(null);
  protected readonly reports: Report[] = [
    { id: 'analysis', title: 'Error Analysis Report', format: 'Markdown (.md)', icon: 'analytics', description: 'All error clusters with severity, category, root cause and business impact.' },
    { id: 'stories', title: 'Generated Bug Stories', format: 'Markdown (.md)', icon: 'bug_report', description: 'Every generated bug story in one Markdown document.' },
    { id: 'tests', title: 'Regression Test Cases', format: 'CSV (.csv)', icon: 'fact_check', description: 'Regression test cases ready to import into your test management tool.' },
    { id: 'excel', title: 'Excel Export', format: 'Excel workbook (.xlsx)', icon: 'grid_on', description: 'Workbook with Error Clusters, Bug Stories and Test Cases sheets.' },
  ];

  protected async download(id: ReportId): Promise<void> {
    this.busy.set(id);
    try {
      switch (id) {
        case 'analysis': {
          const clusters = await firstValueFrom(this.clusters.getClusters());
          if (!this.hasData(clusters.length, 'error clusters')) return;
          this.exporter.downloadErrorAnalysisReport(clusters);
          break;
        }
        case 'stories': {
          const stories = await firstValueFrom(this.stories.getAll());
          if (!this.hasData(stories.length, 'bug stories')) return;
          this.exporter.downloadAllBugStoriesMarkdown(stories);
          break;
        }
        case 'tests': {
          const tests = await firstValueFrom(this.tests.getAll());
          if (!this.hasData(tests.length, 'test cases')) return;
          this.exporter.exportTestCasesCsv(tests);
          break;
        }
        case 'excel': {
          const [c, s, t] = await Promise.all([
            firstValueFrom(this.clusters.getClusters()),
            firstValueFrom(this.stories.getAll()),
            firstValueFrom(this.tests.getAll()),
          ]);
          if (!this.hasData(c.length, 'error clusters')) return;
          await this.exporter.exportWorkbook(c, s, t);
          break;
        }
      }
      this.notify.success('Report downloaded.');
    } catch {
      // HTTP errors are already toasted by the error interceptor.
    } finally {
      this.busy.set(null);
    }
  }

  private hasData(count: number, what: string): boolean {
    if (count === 0) this.notify.warn(`There are no ${what} to export yet.`);
    return count > 0;
  }
}

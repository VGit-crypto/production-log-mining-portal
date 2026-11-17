import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { NotificationService } from '../../core/services/notification.service';
import { createLoader } from '../../core/utils/data-loader';
import { BugStory } from '../../models';
import { BugStoryService } from '../../services/bug-story.service';
import { ExportService } from '../../services/export.service';
import {
  EmptyStateComponent,
  ErrorBoundaryComponent,
  PageHeaderComponent,
  SeverityChipComponent,
} from '../../shared/components/components';
import { summarize } from '../../shared/markdown';
import { BugStoryDialogComponent, BugStoryDialogData } from './bug-story-dialog.component';

@Component({
  selector: 'app-bug-stories',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe, RouterLink, MatButtonModule, MatCardModule, MatIconModule,
    PageHeaderComponent, SeverityChipComponent, ErrorBoundaryComponent, EmptyStateComponent,
  ],
  templateUrl: './bug-stories.component.html',
  styles: `
    .list { display: grid; gap: 16px; }
    .desc { margin: 12px 0 8px; line-height: 1.55; }
    .impact { margin: 0 0 6px; line-height: 1.55; }
    .more { margin: 0; color: var(--app-muted); font-size: 13px; }
    mat-card-content { padding-top: 12px; }
  `,
})
export class BugStoriesComponent {
  private readonly svc = inject(BugStoryService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);
  protected readonly exporter = inject(ExportService);
  protected readonly stories = createLoader(() => this.svc.getAll());

  /** Plain-text preview for the card (the full formatted story is in the View dialog). */
  protected summary(markdown: string, max = 280): string {
    return summarize(markdown, max);
  }

  protected open(story: BugStory, mode: BugStoryDialogData['mode']): void {
    this.dialog
      .open<BugStoryDialogComponent, BugStoryDialogData, BugStory>(BugStoryDialogComponent, {
        data: { story, mode },
        width: '860px',
        maxWidth: '95vw',
        autoFocus: mode === 'edit' ? 'first-tabbable' : 'dialog',
      })
      .afterClosed()
      .subscribe((edited) => {
        if (!edited) return;
        this.svc.update(edited).subscribe(() => {
          this.notify.success('Bug story saved.');
          this.stories.load();
        });
      });
  }
}

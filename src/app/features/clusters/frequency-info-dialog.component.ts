import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { GroupBasis } from '../../models';

export interface FrequencyInfoData {
  occurrences: number;
  groupBasis?: GroupBasis;
  groupKey?: string;
}

/** Explains how a cluster's frequency (occurrence count) was decided. */
@Component({
  selector: 'app-frequency-info-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatDialogModule, MatButtonModule],
  templateUrl: './frequency-info-dialog.component.html',
  styles: `
    p { margin: 8px 0; }
    .key { background: #f3f6fb; border-radius: 6px; padding: 8px 10px; }
    .muted { color: var(--app-muted); }
  `,
})
export class FrequencyInfoDialogComponent {
  protected readonly data = inject<FrequencyInfoData>(MAT_DIALOG_DATA);
}

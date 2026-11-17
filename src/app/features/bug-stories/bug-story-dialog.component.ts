import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { BugStory } from '../../models';
import { ExportService } from '../../services/export.service';
import { SeverityChipComponent } from '../../shared/components/components';
import { MarkdownViewComponent } from '../../shared/components/markdown-view.component';

export interface BugStoryDialogData {
  story: BugStory;
  mode: 'view' | 'edit';
}

/** Returns the edited BugStory on save, otherwise undefined. */
@Component({
  selector: 'app-bug-story-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule,
    SeverityChipComponent, MarkdownViewComponent,
  ],
  templateUrl: './bug-story-dialog.component.html',
  styles: `
    h3 { margin: 0 0 6px; font-size: 15px; color: var(--app-navy); }
    p { margin: 0; }
    .meta { display: flex; align-items: center; gap: 12px; color: var(--app-muted); font-size: 13px; margin-bottom: 8px; }
    .section { padding: 14px 0; border-top: 1px solid var(--app-border); }
    .section:first-of-type { border-top: 0; padding-top: 6px; }
    .ac { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .ac li { display: grid; grid-template-columns: 52px 1fr; gap: 10px; align-items: start; }
    .ac-id { background: #e8f0fc; color: var(--app-navy); font-weight: 600; font-size: 12px; text-align: center; border-radius: 6px; padding: 3px 0; margin-top: 2px; }
    .ac-text { min-width: 0; }
    .full { width: 100%; }
    .crit { display: flex; gap: 4px; align-items: baseline; }
    .grow { flex: 1; }
  `,
})
export class BugStoryDialogComponent {
  protected readonly data = inject<BugStoryDialogData>(MAT_DIALOG_DATA);
  protected readonly exporter = inject(ExportService);
  private readonly ref = inject(MatDialogRef<BugStoryDialogComponent, BugStory>);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly fields = [
    { key: 'description', label: 'Description' },
    { key: 'rootCause', label: 'Root Cause Analysis' },
    { key: 'businessImpact', label: 'Business Impact' },
  ] as const;

  protected readonly form = this.fb.group({
    title: [this.data.story.title, [Validators.required, Validators.maxLength(200)]],
    description: [this.data.story.description, Validators.required],
    rootCause: [this.data.story.rootCause, Validators.required],
    businessImpact: [this.data.story.businessImpact, Validators.required],
    criteria: this.fb.array(this.data.story.acceptanceCriteria.map((a) => this.fb.control(a.description, Validators.required))),
  });

  protected get criteria(): FormArray {
    return this.form.controls.criteria;
  }

  protected add(): void {
    this.criteria.push(this.fb.control('', Validators.required));
  }

  protected remove(i: number): void {
    this.criteria.removeAt(i);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.ref.close({
      ...this.data.story,
      title: v.title.trim(),
      description: v.description.trim(),
      rootCause: v.rootCause.trim(),
      businessImpact: v.businessImpact.trim(),
      acceptanceCriteria: v.criteria.map((d, i) => ({ id: this.data.story.acceptanceCriteria[i]?.id ?? `AC-${Date.now()}-${i}`, description: d.trim() })),
    });
  }
}

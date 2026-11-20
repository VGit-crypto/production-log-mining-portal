import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { environment } from '../../../environments/environment';
import { NotificationService } from '../../core/services/notification.service';
import { UploadResult } from '../../models';
import { LogUploadService } from '../../services/log-upload.service';
import { PageHeaderComponent } from '../../shared/components/components';

type Phase = 'idle' | 'validating' | 'uploading' | 'processing' | 'done';

@Component({
  selector: 'app-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatCardModule, MatIconModule, MatProgressBarModule, PageHeaderComponent],
  templateUrl: './upload.component.html',
  styles: `
    .dropzone { border: 2px dashed #c7c4ff; border-radius: 12px; padding: 48px 16px; text-align: center; cursor: pointer; background: #f8fafc; transition: background .15s, border-color .15s; }
    .dropzone:hover, .dropzone.drag { background: #eef0ff; border-color: var(--app-primary); }
    .dropzone.busy { opacity: .6; cursor: progress; }
    .dropzone mat-icon { width: 56px; height: 56px; font-size: 56px; color: var(--app-primary); }
    .main { font-size: 18px; margin: 8px 0 4px; }
    .link { color: var(--app-primary); text-decoration: underline; }
    .hint { color: var(--app-muted); margin: 0; }
    .progress { margin-top: 24px; display: grid; gap: 8px; }
    .row { display: flex; align-items: center; gap: 8px; }
    .name { overflow-wrap: anywhere; }
    .phase { margin-left: auto; color: var(--app-muted); }
    .error { margin-top: 16px; display: flex; gap: 8px; align-items: flex-start; color: #b91c1c; background: #fee2e2; padding: 12px 16px; border-radius: 8px; }
    .result { margin-top: 24px; }
    .result h2 { margin: 0 0 12px; font-size: 18px; color: var(--app-navy); }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 0 0 16px; }
    .note { color: var(--app-muted); margin: 0 0 12px; }
    .warn { display: flex; gap: 8px; align-items: flex-start; color: #92400e; background: #fef3c7; padding: 10px 14px; border-radius: 8px; margin: 0 0 12px; }
    dt { color: var(--app-muted); font-size: 13px; }
    dd { margin: 0; font-size: 24px; font-weight: 700; color: var(--app-navy); }
  `,
})
export class UploadComponent {
  private readonly uploads = inject(LogUploadService);
  private readonly notify = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly accepted = environment.upload.acceptedExtensions.join(',');
  protected readonly maxMb = environment.upload.maxFileSizeMb;

  protected readonly dragging = signal(false);
  protected readonly phase = signal<Phase>('idle');
  protected readonly percent = signal(0);
  protected readonly fileName = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<UploadResult | null>(null);

  protected busy(): boolean {
    return ['validating', 'uploading', 'processing'].includes(this.phase());
  }

  protected phaseLabel(): string {
    return {
      idle: '',
      validating: 'Validating…',
      uploading: `Uploading ${this.percent()}%`,
      processing: 'Analyzing errors and generating results…',
      done: 'Done',
    }[this.phase()];
  }

  protected onDragOver(e: DragEvent): void {
    e.preventDefault();
    if (!this.busy()) this.dragging.set(true);
  }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    if (this.busy()) return;
    const files = e.dataTransfer?.files;
    if (files && files.length > 1) this.notify.warn('Only one file can be processed at a time. Using the first file.');
    if (files?.[0]) void this.handle(files[0]);
  }

  protected onPick(e: Event, input: HTMLInputElement): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (file) void this.handle(file);
  }

  private async handle(file: File): Promise<void> {
    this.error.set(null);
    this.result.set(null);
    this.percent.set(0);
    this.fileName.set(file.name);
    this.phase.set('validating');

    const check = await this.uploads.validateFile(file).catch(() => ({ valid: false, error: `Could not read "${file.name}".` }));
    if (!check.valid) {
      this.fail(check.error ?? 'Invalid file.');
      return;
    }

    this.phase.set('uploading');
    this.uploads
      .upload(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ev) => {
          if (ev.status === 'progress') {
            this.percent.set(ev.percent);
            if (ev.percent >= 99) this.phase.set('processing');
          } else {
            this.percent.set(100);
            this.result.set(ev.result);
            this.phase.set('done');
            this.notify.success(`${file.name} processed: ${ev.result.clustersCreated + ev.result.clustersUpdated} cluster(s) found.`);
          }
        },
        error: (e: Error) => this.fail(e.message, false),
      });
  }

  private fail(message: string, toast = true): void {
    this.error.set(message);
    this.phase.set('idle');
    // HTTP failures were already toasted by the error interceptor.
    if (toast) this.notify.error(message);
  }
}

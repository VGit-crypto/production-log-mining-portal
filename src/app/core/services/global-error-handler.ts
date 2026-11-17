import { ErrorHandler, inject, Injectable, NgZone } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NotificationService } from './notification.service';

/** Last-resort handler for uncaught errors. HTTP errors are already surfaced by the error interceptor. */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly notifier = inject(NotificationService);
  private readonly zone = inject(NgZone);

  handleError(error: unknown): void {
    console.error('[Unhandled error]', error);
    if (error instanceof HttpErrorResponse) return;
    this.zone.run(() => this.notifier.error('Something went wrong. Please retry or contact support if it persists.'));
  }
}

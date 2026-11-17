import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** Toast notifications. Messages are announced to screen readers by MatSnackBar (aria-live). */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.show(message, 'toast-success', 4000);
  }

  info(message: string): void {
    this.show(message, 'toast-info', 4000);
  }

  warn(message: string): void {
    this.show(message, 'toast-warn', 6000);
  }

  error(message: string): void {
    this.show(message, 'toast-error', 8000);
  }

  private show(message: string, panelClass: string, duration: number): void {
    this.snackBar.open(message, 'Dismiss', {
      duration,
      panelClass: [panelClass],
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
    });
  }
}

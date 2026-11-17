import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { map } from 'rxjs';
import { LoadingService } from '../services/loading.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    MatToolbarModule, MatSidenavModule, MatListModule, MatIconModule, MatButtonModule, MatProgressBarModule,
  ],
  templateUrl: './shell.component.html',
  styles: `
    :host { display: flex; flex-direction: column; height: 100vh; }
    .skip-link { position: absolute; left: -999px; top: 0; z-index: 1000; background: #fff; padding: 8px 16px; }
    .skip-link:focus { left: 8px; top: 8px; }
    .header { background: var(--app-navy); color: #fff; flex: none; gap: 8px; position: relative; z-index: 3; }
    .header button { color: #fff; }
    .logo { margin-right: 4px; }
    .title { font-size: 18px; font-weight: 500; }
    .progress { height: 4px; flex: none; }
    .container { flex: 1; background: #fff; }
    mat-sidenav { width: 240px; background: #f5f7fb; border-right: 1px solid var(--app-border); }
    .active { background: #dfe8f7; font-weight: 600; }
    .content { padding: 24px; max-width: 1400px; margin: 0 auto; outline: none; }
    @media (max-width: 599px) { .content { padding: 16px; } .title { font-size: 16px; } }
  `,
})
export class ShellComponent {
  protected readonly loading = inject(LoadingService);
  protected readonly isMobile = toSignal(
    inject(BreakpointObserver).observe('(max-width: 899px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  protected readonly items: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/upload', label: 'Upload Logs', icon: 'cloud_upload' },
    { path: '/clusters', label: 'Error Clusters', icon: 'bubble_chart' },
    { path: '/bug-stories', label: 'Bug Stories', icon: 'bug_report' },
    { path: '/test-cases', label: 'Test Cases', icon: 'fact_check' },
    { path: '/reports', label: 'Reports', icon: 'summarize' },
  ];
}

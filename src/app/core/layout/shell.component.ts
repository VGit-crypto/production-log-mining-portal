import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { filter, map } from 'rxjs';
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
    MatSidenavModule, MatListModule, MatIconModule, MatButtonModule, MatProgressBarModule,
  ],
  templateUrl: './shell.component.html',
  styles: `
    :host { display: block; height: 100vh; }
    .skip-link { position: absolute; left: -999px; top: 0; z-index: 1000; background: #fff; padding: 8px 16px; border-radius: 8px; }
    .skip-link:focus { left: 8px; top: 8px; }
    .container { height: 100%; background: var(--app-bg); }

    mat-sidenav {
      width: 264px; background: var(--n-900); border: 0; border-radius: 0; display: flex; flex-direction: column;
      --mat-sidenav-container-shape: 0;
      --mat-list-list-item-label-text-color: var(--n-300);
      --mat-list-list-item-leading-icon-color: var(--n-300);
      --mat-list-list-item-hover-label-text-color: #ffffff;
      --mat-list-list-item-hover-leading-icon-color: #ffffff;
      --mat-list-list-item-hover-state-layer-opacity: 0;
      --mat-list-list-item-focus-state-layer-opacity: 0;
      --mat-list-list-item-label-text-weight: 500;
      --mat-list-list-item-container-shape: 12px;
    }
    .brand { display: flex; align-items: center; gap: 12px; height: 72px; padding: 0 24px; flex: none; }
    .mark { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; color: #fff;
      background: linear-gradient(135deg, var(--c-primary), var(--c-secondary)); box-shadow: 0 6px 16px rgba(99, 91, 255, .45); }
    .mark mat-icon { transform: rotate(45deg); }
    .brand-text { display: grid; line-height: 1.25; }
    .title { color: #fff; font-size: 16px; font-weight: 600; }
    .tagline { color: var(--n-300); font-size: 12px; font-weight: 500; }
    nav { flex: 1; padding: 8px 16px; }
    .nav-label { margin: 16px 8px 8px; font-size: 12px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--n-300); opacity: .8; }
    a[mat-list-item] { border-radius: 12px; margin-bottom: 4px; transition: background-color 150ms var(--app-ease), color 150ms var(--app-ease); }
    a[mat-list-item]:hover { background: rgba(99, 91, 255, .18); }
    a.active {
      background: var(--c-primary);
      box-shadow: 0 6px 16px rgba(99, 91, 255, .4);
      --mat-list-list-item-label-text-color: #ffffff;
      --mat-list-list-item-leading-icon-color: #ffffff;
      --mat-list-list-item-label-text-weight: 600;
    }
    a.active:hover { background: var(--c-primary); }
    .side-foot { padding: 16px 24px 24px; font-size: 12px; color: var(--n-300); opacity: .75; border-top: 1px solid rgba(203, 213, 225, .12); }

    .topbar {
      position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 16px; height: 64px; padding: 0 32px;
      background: rgba(255, 255, 255, .92); backdrop-filter: blur(8px); box-shadow: 0 1px 0 var(--n-200), 0 4px 16px rgba(15, 23, 42, .04);
    }
    .crumbs { display: flex; align-items: center; gap: 4px; font-size: 14px; white-space: nowrap; }
    .crumbs mat-icon { width: 20px; height: 20px; font-size: 20px; color: var(--n-300); }
    .crumb-root { color: var(--n-500); }
    .crumb-current { color: var(--n-900); font-weight: 600; }
    .spacer { flex: 1; }
    .progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; }
    .content { padding: 32px 32px 48px; max-width: 1440px; margin: 0 auto; outline: none; }
    @media (max-width: 599px) {
      .topbar { padding: 0 16px; }
      .crumb-root, .crumbs mat-icon { display: none; }
      .content { padding: 16px 16px 32px; }
    }
  `,
})
export class ShellComponent {
  protected readonly loading = inject(LoadingService);
  protected readonly isMobile = toSignal(
    inject(BreakpointObserver).observe('(max-width: 899px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects)),
    { initialValue: this.router.url },
  );
  protected readonly currentLabel = computed(() => this.items.find((i) => this.url().startsWith(i.path))?.label ?? 'Portal');
  protected readonly items: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/upload', label: 'Upload Logs', icon: 'cloud_upload' },
    { path: '/clusters', label: 'Error Clusters', icon: 'bubble_chart' },
    { path: '/bug-stories', label: 'Bug Stories', icon: 'bug_report' },
    { path: '/test-cases', label: 'Test Cases', icon: 'fact_check' },
    { path: '/reports', label: 'Reports', icon: 'summarize' },
  ];
}

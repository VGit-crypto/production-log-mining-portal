import { Routes } from '@angular/router';
import { ShellComponent } from './core/layout/shell.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard | Log Mining Portal',
        loadChildren: () => import('./features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
      },
      {
        path: 'upload',
        title: 'Upload Logs | Log Mining Portal',
        loadChildren: () => import('./features/upload/upload.routes').then((m) => m.UPLOAD_ROUTES),
      },
      {
        path: 'clusters',
        loadChildren: () => import('./features/clusters/clusters.routes').then((m) => m.CLUSTER_ROUTES),
      },
      {
        path: 'bug-stories',
        title: 'Bug Stories | Log Mining Portal',
        loadChildren: () => import('./features/bug-stories/bug-stories.routes').then((m) => m.BUG_STORY_ROUTES),
      },
      {
        path: 'test-cases',
        title: 'Test Cases | Log Mining Portal',
        loadChildren: () => import('./features/test-cases/test-cases.routes').then((m) => m.TEST_CASE_ROUTES),
      },
      {
        path: 'reports',
        title: 'Reports | Log Mining Portal',
        loadChildren: () => import('./features/reports/reports.routes').then((m) => m.REPORT_ROUTES),
      },
      {
        path: '**',
        title: 'Not found | Log Mining Portal',
        loadComponent: () => import('./core/layout/not-found.component').then((m) => m.NotFoundComponent),
      },
    ],
  },
];

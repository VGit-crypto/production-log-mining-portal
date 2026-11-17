import { Routes } from '@angular/router';

export const TEST_CASE_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./test-cases.component').then((m) => m.TestCasesComponent) },
];

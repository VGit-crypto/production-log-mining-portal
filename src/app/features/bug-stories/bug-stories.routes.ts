import { Routes } from '@angular/router';

export const BUG_STORY_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./bug-stories.component').then((m) => m.BugStoriesComponent) },
];

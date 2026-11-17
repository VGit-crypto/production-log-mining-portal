import { Routes } from '@angular/router';

export const CLUSTER_ROUTES: Routes = [
  {
    path: '',
    title: 'Error Clusters | Log Mining Portal',
    loadComponent: () => import('./cluster-list.component').then((m) => m.ClusterListComponent),
  },
  {
    path: ':id',
    title: 'Cluster Details | Log Mining Portal',
    loadComponent: () => import('./cluster-details.component').then((m) => m.ClusterDetailsComponent),
  },
];

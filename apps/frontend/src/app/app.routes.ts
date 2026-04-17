import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'schedule',
    loadComponent: () => import('./pages/schedule/schedule').then((m) => m.Schedule),
  },
  {
    path: 'predictions',
    loadComponent: () => import('./pages/predictions/predictions').then((m) => m.Predictions),
  },
  {
    path: 'goals',
    loadComponent: () => import('./pages/goals/goals').then((m) => m.Goals),
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings),
  },
  { path: '**', redirectTo: 'dashboard' },
];


import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./modules/test-connexion/login').then((component) => component.LoginComponent),
  },
  {
    path: 'home',
    loadComponent: () => import('./modules/home/home').then((component) => component.HomeComponent),
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];

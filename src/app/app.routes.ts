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
    path: 'agenda',
    loadComponent: () =>
      import('./modules/calendrier/calendrier').then((m) => m.CalendrierComponent),
  },
  {
    path: 'home',
    loadComponent: () => import('./modules/home/home').then((component) => component.HomeComponent),
  },
  {
    path: 'atelier',
    loadComponent: () =>
      import('./modules/atelier/atelier').then((component) => component.AtelierComponent),
  },
  {
    path: 'courses',
    loadComponent: () =>
      import('./modules/courses/courses-alimentation').then(
        (component) => component.CoursesAlimentationComponent,
      ),
  },

  {
    path: '**',
    redirectTo: 'login',
  },
];

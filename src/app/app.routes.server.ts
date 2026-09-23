import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // Personal tasks use browser-stored authentication; do not prerender a loading-only page.
    path: 'home',
    renderMode: RenderMode.Client,
  },
  { path: 'agenda', renderMode: RenderMode.Client },
  { path: 'atelier', renderMode: RenderMode.Client },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];

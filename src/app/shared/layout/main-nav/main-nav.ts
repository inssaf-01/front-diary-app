import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavigationItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-main-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './main-nav.html',
  styleUrl: './main-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainNavComponent {
  readonly navigation: NavigationItem[] = [
    { label: 'Accueil', icon: 'pi-home', route: '/home' },
    { label: 'Agenda', icon: 'pi-calendar', route: '/agenda' },
    {
      label: 'Atelier',
      icon: 'pi-pencil',
      route: '/atelier',
    },
    { label: 'Tâches', icon: 'pi-check-square', route: '/tasks' },
    { label: 'Projets', icon: 'pi-bullseye', route: '/projects' },
    { label: 'Finances', icon: 'pi-chart-bar', route: '/finances' },
    { label: 'courses', icon: 'pi-shopping-bag', route: '/courses' },

    { label: 'Notes', icon: 'pi-file', route: '/notes' },
  ];
}

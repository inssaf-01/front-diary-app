import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  afterNextRender,
  inject,
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  HomeCalendarService,
  ParametreResponse,
  TacheResponse,
} from '../calendrier/home-calendar.service';

import { AuthenticatedUser, LoginService } from '../test-connexion/services/login';

export type EventTone = 'mint' | 'blue' | 'orange' | 'purple' | 'pink';

export interface HomeUser {
  firstName: string;
  fullName: string;
  avatarUrl: string;
  status: string;
}

export interface WeekDay {
  shortName: string;
  day: number;
  active?: boolean;
}

export interface TimelineEvent {
  id: string;
  time: string;
  title: string;
  subtitle: string;
  icon: string;
  tone: EventTone;
  team?: string;
  duration?: string;
  badge?: string;
}

export interface TimelineGroup {
  key: string;
  label: string;
  dateLabel: string;
  events: TimelineEvent[];
}

interface TypeDisplayConfig {
  icon: string;
  tone: EventTone;
}

const TYPE_DISPLAY_CONFIG: Record<string, TypeDisplayConfig> = {
  TACHE: {
    icon: 'pi-list-check',
    tone: 'mint',
  },

  REUNION: {
    icon: 'pi-users',
    tone: 'blue',
  },

  EVENEMENT: {
    icon: 'pi-calendar',
    tone: 'purple',
  },

  ANNIVERSAIRE: {
    icon: 'pi-gift',
    tone: 'pink',
  },

  COURSES: {
    icon: 'pi-shopping-cart',
    tone: 'orange',
  },
};

const DEFAULT_DISPLAY_CONFIG: TypeDisplayConfig = {
  icon: 'pi-calendar',
  tone: 'blue',
};

const PRIORITY_ORDER: Record<string, number> = {
  URGENTE: 1,
  HAUTE: 2,
  NORMALE: 3,
  BASSE: 4,
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly router = inject(Router);
  private readonly calendarService = inject(HomeCalendarService);
  private readonly loginService = inject(LoginService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly maxEvents = 7;

  currentUser: AuthenticatedUser | null = null;

  user: HomeUser = {
    firstName: this.currentUser?.username ?? 'Inssaf',

    fullName: this.currentUser?.username ?? 'Inssaf',

    avatarUrl: 'assets/images/avatar-inssaf.jpg',

    status: 'Un jour plus aligné',
  };

  readonly navigation = [
    {
      label: 'Accueil',
      icon: 'pi-home',
      route: '/home',
    },
    {
      label: 'Agenda',
      icon: 'pi-calendar',
      route: '/agenda',
    },
    {
      label: 'Tâches',
      icon: 'pi-check-square',
      route: '/tasks',
    },
    {
      label: 'Projets',
      icon: 'pi-bullseye',
      route: '/projects',
    },
    {
      label: 'Finances',
      icon: 'pi-chart-bar',
      route: '/finances',
    },
    {
      label: 'Listes',
      icon: 'pi-list',
      route: '/lists',
    },
    {
      label: 'Notes',
      icon: 'pi-file',
      route: '/notes',
    },
  ];

  week: WeekDay[] = [];

  groups: TimelineGroup[] = [];

  calendarLoading = true;
  calendarError = false;

  readonly travelSaving = {
    title: 'Épargne voyage',
    subtitle: 'Cap sur de nouveaux horizons',
    percent: 68,
  };

  readonly lowStock = {
    title: 'Lait presque épuisé',
    subtitle: 'Pensez à en ajouter à votre liste',
  };

  readonly shopping = {
    title: 'Ma liste de courses',
    count: 7,
    subtitle: 'Voir et modifier ma liste',
  };

  readonly budget = {
    title: 'Budget du mois',
    percent: 64,
    used: 1280,
    total: 2000,
  };

  readonly recentNote = {
    title: 'Note récente',
    date: 'Hier, 22:14',
    text: '« Se sentir bien aujourd’hui,\n' + 'c’est construire un meilleur demain. »',
  };

  constructor() {
    afterNextRender(() => {
      if (!this.loginService.getAccessToken()) {
        this.calendarLoading = false;
        void this.router.navigateByUrl('/login');
        this.changeDetectorRef.markForCheck();
        return;
      }
      this.currentUser = this.loginService.getCurrentUser();
      this.user = { ...this.user,
        firstName: this.currentUser?.username ?? this.user.firstName,
        fullName: this.currentUser?.username ?? this.user.fullName };
      this.week = this.buildCurrentWeek();
      this.loadCalendar();
      this.changeDetectorRef.markForCheck();
    });
  }

  private loadCalendar(): void {
    this.calendarLoading = true;
    this.calendarError = false;

    const dateDebut = this.startOfDay(new Date());

    /*
     * La période de consultation reste de 7 jours.
     * Seul l'affichage Home est limité à 6 tâches.
     */
    const dateFin = this.addDays(dateDebut, 7);

    this.calendarService
      .loadCalendar(dateDebut, dateFin)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ typesTache, taches }) => {
          this.groups = this.buildTimelineGroups(taches.filter(tache => {
            const start = new Date(tache.dateDebut).getTime();
            return start >= dateDebut.getTime() && start < dateFin.getTime();
          }), typesTache);

          this.calendarLoading = false;
          this.calendarError = false;

          this.changeDetectorRef.markForCheck();
        },

        error: (error: unknown) => {
          console.error('Erreur lors du chargement du calendrier', error);

          this.groups = [];
          this.calendarLoading = false;
          this.calendarError = true;

          this.changeDetectorRef.markForCheck();
        },
      });
  }

  private buildTimelineGroups(
    taches: TacheResponse[],
    typesTache: ParametreResponse[],
  ): TimelineGroup[] {
    const typeLabels = new Map<number, string>(typesTache.map((type) => [type.id, type.libelle]));

    /*
     * On supprime les tâches qui ne doivent plus apparaître
     * dans le calendrier de la Home.
     */
    const visibleTasks = taches.filter((tache) => {
      const statusCode = tache.statut?.code?.toUpperCase();

      return statusCode !== 'TERMINEE' && statusCode !== 'ANNULEE';
    });

    /*
     * Regroupement des tâches par date locale.
     */
    const tasksByDate = new Map<string, TacheResponse[]>();

    for (const tache of visibleTasks) {
      const dateKey = this.toLocalDateKey(new Date(tache.dateDebut));

      const currentTasks = tasksByDate.get(dateKey) ?? [];

      currentTasks.push(tache);
      tasksByDate.set(dateKey, currentTasks);
    }

    /*
     * Les jours sont affichés dans l’ordre chronologique.
     */
    const sortedDates = Array.from(tasksByDate.keys()).sort((firstDate, secondDate) =>
      firstDate.localeCompare(secondDate),
    );

    const result: TimelineGroup[] = [];
    let displayedEvents = 0;

    for (const dateKey of sortedDates) {
      if (displayedEvents >= this.maxEvents) {
        break;
      }

      const dateTasks = tasksByDate.get(dateKey) ?? [];

      /*
       * Dans chaque journée :
       * priorité la plus forte, puis heure la plus proche.
       */
      dateTasks.sort((firstTask, secondTask) => {
        const priorityDifference =
          this.getPriorityOrder(firstTask) - this.getPriorityOrder(secondTask);

        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        return new Date(firstTask.dateDebut).getTime() - new Date(secondTask.dateDebut).getTime();
      });

      const remainingPlaces = this.maxEvents - displayedEvents;

      const selectedTasks = dateTasks.slice(0, remainingPlaces);

      if (selectedTasks.length === 0) {
        continue;
      }

      const groupDate = new Date(selectedTasks[0].dateDebut);

      const events = selectedTasks.map((tache) => this.toTimelineEvent(tache, typeLabels));

      result.push({
        key: this.buildGroupKey(groupDate),
        label: this.buildGroupLabel(groupDate),
        dateLabel: this.formatLongDate(groupDate),
        events,
      });

      displayedEvents += events.length;
    }

    return result;
  }

  private toTimelineEvent(tache: TacheResponse, typeLabels: Map<number, string>): TimelineEvent {
    const typeCode = tache.typeTache?.code?.toUpperCase() ?? 'TACHE';

    const displayConfig = TYPE_DISPLAY_CONFIG[typeCode] ?? DEFAULT_DISPLAY_CONFIG;

    const typeLabel = typeLabels.get(tache.typeTache.id) ?? tache.typeTache.libelle;

    return {
      id: tache.id,

      time: tache.touteLaJournee ? 'Toute la journée' : this.formatTime(tache.dateDebut),

      title: tache.titre,

      subtitle: tache.details?.trim() || typeLabel || 'Aucun détail',

      icon: displayConfig.icon,

      tone: displayConfig.tone,

      duration: this.calculateDuration(tache.dateDebut, tache.dateFin, tache.touteLaJournee),

      badge: tache.priorite?.libelle ?? undefined,
    };
  }

  private getPriorityOrder(tache: TacheResponse): number {
    const priorityCode = tache.priorite?.code?.toUpperCase();

    if (!priorityCode) {
      return 5;
    }

    return PRIORITY_ORDER[priorityCode] ?? 5;
  }

  private calculateDuration(
    dateDebut: string,
    dateFin: string | null,
    touteLaJournee: boolean,
  ): string | undefined {
    if (touteLaJournee || !dateFin) {
      return undefined;
    }

    const start = new Date(dateDebut).getTime();

    const end = new Date(dateFin).getTime();

    const totalMinutes = Math.round((end - start) / 60000);

    if (totalMinutes <= 0) {
      return undefined;
    }

    const hours = Math.floor(totalMinutes / 60);

    const minutes = totalMinutes % 60;

    if (hours === 0) {
      return `${minutes} min`;
    }

    if (minutes === 0) {
      return `${hours} h`;
    }

    return `${hours} h ${minutes}`;
  }

  private buildCurrentWeek(): WeekDay[] {
    const today = this.startOfDay(new Date());

    const monday = new Date(today);

    const dayNumber = today.getDay() === 0 ? 7 : today.getDay();

    monday.setDate(today.getDate() - dayNumber + 1);

    return Array.from({ length: 7 }, (_, index) => {
      const date = this.addDays(monday, index);

      return {
        shortName: new Intl.DateTimeFormat('fr-FR', {
          weekday: 'short',
        })
          .format(date)
          .replace('.', '')
          .replace(/^./, (letter) => letter.toUpperCase()),

        day: date.getDate(),

        active: this.toLocalDateKey(date) === this.toLocalDateKey(today),
      };
    });
  }

  private buildGroupKey(date: Date): string {
    const difference = this.differenceInDays(this.startOfDay(date), this.startOfDay(new Date()));

    if (difference === 0) {
      return 'today';
    }

    if (difference === 1) {
      return 'tomorrow';
    }

    return this.toLocalDateKey(date);
  }

  private buildGroupLabel(date: Date): string {
    const difference = this.differenceInDays(this.startOfDay(date), this.startOfDay(new Date()));

    if (difference === 0) {
      return 'Aujourd’hui';
    }

    if (difference === 1) {
      return 'Demain';
    }

    return `Dans ${difference} jours`;
  }

  private formatLongDate(date: Date): string {
    const formattedDate = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);

    return formattedDate.replace(/^./, (letter) => letter.toUpperCase());
  }

  private formatTime(dateValue: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(dateValue));
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);

    result.setHours(0, 0, 0, 0);

    return result;
  }

  private addDays(date: Date, numberOfDays: number): Date {
    const result = new Date(date);

    result.setDate(result.getDate() + numberOfDays);

    return result;
  }

  private differenceInDays(firstDate: Date, secondDate: Date): number {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;

    return Math.round((firstDate.getTime() - secondDate.getTime()) / millisecondsPerDay);
  }

  private toLocalDateKey(date: Date): string {
    const year = date.getFullYear();

    const month = String(date.getMonth() + 1).padStart(2, '0');

    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  navigate(route: string): void {
    void this.router.navigateByUrl(route);
  }

  createItem(): void {
    void this.router.navigateByUrl('/quick-add');
  }

  openEvent(event: TimelineEvent): void {
    void this.router.navigate(['/agenda', event.id]);
  }
}

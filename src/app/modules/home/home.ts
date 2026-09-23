import {
  afterNextRender,
  Injector,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { AjoutTacheComponent, CreateTaskPayload } from '../calendrier/ajout-tache/ajout-tache';

import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  HomeCalendarService,
  ParametreResponse,
  TacheResponse,
} from '../calendrier/home-calendar.service';

import { AuthenticatedUser, LoginService } from '../test-connexion/login.service';
import { defer, finalize, first, map } from 'rxjs';

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
  statusCode: string;
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
  hiddenCount: number;
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
  imports: [CommonModule, RouterLink, RouterLinkActive, AjoutTacheComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly calendarService = inject(HomeCalendarService);
  private readonly loginService = inject(LoginService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly injector = inject(Injector);

  @ViewChild('timelineElement') private timelineElement?: ElementRef<HTMLElement>;

  private readonly dayHeaderHeight = 36;
  private readonly groupInnerGap = 10;
  private readonly groupGap = 12;
  private readonly taskRowHeight = 58;
  private readonly taskGap = 8;
  private readonly moreTasksHeight = 28;
  private timelineHeight = 0;
  private resizeObserver?: ResizeObserver;
  private calendarTasks: TacheResponse[] = [];
  private calendarTypes: ParametreResponse[] = [];
  pendingStatuses = new Map<string, string>();
  statusesSaving = false;
  statusMessage = '';
  statusSaveError = false;

  readonly statusOptions = [
    { code: 'A_FAIRE', label: 'À faire' },
    { code: 'EN_COURS', label: 'En cours' },
    { code: 'TERMINEE', label: 'Terminée' },
    { code: 'ANNULEE', label: 'Annulée' },
  ];

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
  taskDialogVisible = false;
  savingTask = false;
  taskSaveError = '';

  openTaskDialog(): void {
    this.taskSaveError = '';
    this.taskDialogVisible = true;
  }

  closeTaskDialog(): void {
    if (this.savingTask) return;
    this.taskDialogVisible = false;
  }

  createTask(task: CreateTaskPayload): void {
    if (this.savingTask) return;
    this.savingTask = true;
    this.taskSaveError = '';
    this.changeDetectorRef.markForCheck();
    defer(() => this.calendarService.createTask(task))
      .pipe(
        first(),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.savingTask = false;
          if (!this.destroyRef.destroyed) this.changeDetectorRef.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.taskDialogVisible = false;
          this.loadCalendar();
        },
        error: () => {
          this.taskSaveError =
            'Impossible d’enregistrer la tâche. Vérifiez les dates et votre connexion, puis réessayez.';
        },
      });
  }
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
  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.currentUser = this.loginService.getCurrentUser();
    this.user = {
      ...this.user,
      firstName: this.currentUser?.username ?? this.user.firstName,
      fullName: this.currentUser?.username ?? this.user.fullName,
    };
    this.week = this.buildCurrentWeek();
    // Start data loading independently of the first browser render.
    this.loadCalendar();

    afterNextRender(
      () => {
        this.observeTimelineSize();
      },
      { injector: this.injector },
    );
  }

  private observeTimelineSize(): void {
    const timeline = this.timelineElement?.nativeElement;
    if (!timeline || typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver(([entry]) => {
      const nextHeight = Math.floor(entry.contentRect.height);
      if (nextHeight <= 0 || Math.abs(nextHeight - this.timelineHeight) < 2) return;

      this.timelineHeight = nextHeight;

      if (this.calendarTasks.length > 0) {
        this.groups = this.buildTimelineGroups(this.calendarTasks, this.calendarTypes);
        this.changeDetectorRef.detectChanges();
      }
    });

    this.resizeObserver.observe(timeline);
    this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());
  }

  private loadCalendar(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.calendarLoading = true;
    this.calendarError = false;
    this.changeDetectorRef.markForCheck();
    const dateDebut = this.startOfDay(new Date());
    const dateFin = this.addDays(dateDebut, 14);

    defer(() => this.calendarService.loadCalendar(dateDebut, dateFin))
      .pipe(
        first(),
        map(({ typesTache, taches }) => {
          const tasks = taches.filter((tache) => {
            const start = new Date(tache.dateDebut).getTime();
            return start >= dateDebut.getTime() && start < dateFin.getTime();
          });
          return { typesTache, tasks, groups: this.buildTimelineGroups(tasks, typesTache) };
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.calendarLoading = false;
          // Apply the completed request to this OnPush view without waiting for an interaction.
          if (!this.destroyRef.destroyed) this.changeDetectorRef.detectChanges();
        }),
      )
      .subscribe({
        next: ({ typesTache, tasks, groups }) => {
          this.calendarTypes = typesTache;
          this.calendarTasks = tasks;
          this.groups = groups;
        },
        error: (error) => {
          console.error('[CALENDRIER] erreur =', error);
          console.error('[CALENDRIER] statut HTTP =', error.status);
          console.error('[CALENDRIER] réponse =', error.error);

          this.groups = [];
          this.calendarError = true;
          this.changeDetectorRef.markForCheck();
        },
      });
  }

  toggleTaskStatus(event: TimelineEvent): void {
    if (this.statusesSaving) return;

    const originalStatus = this.calendarTasks.find((task) => task.id === event.id)?.statut.code;
    if (!originalStatus) return;
    this.setPendingStatus(event, this.pendingStatuses.has(event.id) ? originalStatus : 'TERMINEE');
  }

  changeTaskStatus(event: TimelineEvent, statusEvent: Event): void {
    const select = statusEvent.target as HTMLSelectElement;
    this.setPendingStatus(event, select.value);
  }

  private setPendingStatus(event: TimelineEvent, statusCode: string): void {
    if (this.statusesSaving) return;

    const pending = new Map(this.pendingStatuses);

    const savedTask = this.calendarTasks.find((task) => task.id === event.id);
    if (!savedTask) return;
    const originalStatus = savedTask.statut.code.toUpperCase();
    const newStatus = statusCode.trim().toUpperCase();
    if (!this.statusOptions.some((status) => status.code === newStatus)) return;

    if (newStatus === originalStatus) {
      pending.delete(event.id);
    } else {
      pending.set(event.id, newStatus);
    }

    this.pendingStatuses = pending;
    this.statusMessage = '';
    this.statusSaveError = false;

    this.changeDetectorRef.markForCheck();
  }

  cancelStatusChanges(): void {
    if (this.statusesSaving) return;
    this.pendingStatuses = new Map();
    this.statusMessage = '';
    this.statusSaveError = false;
    this.changeDetectorRef.markForCheck();
  }

  confirmStatusChanges(): void {
    if (this.statusesSaving || this.pendingStatuses.size === 0) return;
    const modifications = Array.from(this.pendingStatuses, ([tacheId, statutCode]) => ({
      tacheId,
      statutCode,
    }));
    this.statusesSaving = true;
    this.statusMessage = '';
    this.statusSaveError = false;
    this.changeDetectorRef.markForCheck();
    defer(() => this.calendarService.updateStatuses(modifications))
      .pipe(
        first(),
        map((updatedTasks) => {
          // Validate before committing local state: a malformed response must remain retryable.
          if (!Array.isArray(updatedTasks) || updatedTasks.length !== modifications.length) {
            throw new Error('Invalid status update response');
          }
          const updatedById = new Map(updatedTasks.map((task) => [task.id, task]));
          if (
            updatedById.size !== modifications.length ||
            modifications.some(
              (change) => updatedById.get(change.tacheId)?.statut?.code !== change.statutCode,
            )
          ) {
            throw new Error('Incomplete status update response');
          }
          const tasks = this.calendarTasks.map((task) => updatedById.get(task.id) ?? task);
          const groups = this.buildTimelineGroups(tasks, this.calendarTypes);
          return { tasks, groups };
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.statusesSaving = false;
          // Render the completed request immediately in this OnPush view.
          if (!this.destroyRef.destroyed) this.changeDetectorRef.detectChanges();
        }),
      )
      .subscribe({
        next: ({ tasks, groups }) => {
          this.calendarTasks = tasks;
          this.groups = groups;
          this.pendingStatuses = new Map();
          this.statusMessage = 'Les statuts ont été mis à jour';
        },
        error: () => {
          this.statusSaveError = true;
          this.statusMessage = 'Impossible d’enregistrer les changements. Réessayez.';
        },
      });
  }

  private buildTimelineGroups(
    taches: TacheResponse[],
    typesTache: ParametreResponse[],
  ): TimelineGroup[] {
    const typeLabels = new Map<number, string>(typesTache.map((type) => [type.id, type.libelle]));

    const visibleTasks = taches.filter((tache) => {
      const statusCode = tache.statut?.code?.toUpperCase();

      return statusCode === 'A_FAIRE' || statusCode === 'EN_COURS';
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

    const datedTasks = sortedDates.map((dateKey) => {
      const dateTasks = tasksByDate.get(dateKey) ?? [];

      /*
       * Dans chaque journée :
       * Heure de début croissante, puis priorité en cas d'égalité.
       */
      dateTasks.sort((firstTask, secondTask) => {
        const timeDifference =
          new Date(firstTask.dateDebut).getTime() - new Date(secondTask.dateDebut).getTime();
        return (
          timeDifference || this.getPriorityOrder(firstTask) - this.getPriorityOrder(secondTask)
        );
      });

      return { dateTasks };
    });

    /* Sur mobile la page est naturellement scrollable : aucun élément n'est masqué. */
    if (typeof window !== 'undefined' && window.innerWidth <= 1180) {
      return datedTasks.map(({ dateTasks }) => {
        const groupDate = new Date(dateTasks[0].dateDebut);
        return {
          key: this.buildGroupKey(groupDate),
          label: this.buildGroupLabel(groupDate),
          dateLabel: this.formatLongDate(groupDate),
          events: dateTasks.map((task) => this.toTimelineEvent(task, typeLabels)),
          hiddenCount: 0,
        };
      });
    }

    const availableHeight = this.timelineHeight || 560;
    const totalTaskCount = datedTasks.reduce((total, group) => total + group.dateTasks.length, 0);
    const selectedGroups: Array<{ dateTasks: TacheResponse[]; visibleCount: number }> = [];
    let usedHeight = 0;

    /* On réserve d'abord le titre et une première tâche pour chaque date affichable. */
    for (const { dateTasks } of datedTasks) {
      const minimumGroupHeight =
        (selectedGroups.length > 0 ? this.groupGap : 0) +
        this.dayHeaderHeight +
        this.groupInnerGap +
        this.taskRowHeight;

      if (usedHeight + minimumGroupHeight > availableHeight) break;

      selectedGroups.push({ dateTasks, visibleCount: 1 });
      usedHeight += minimumGroupHeight;
    }

    /* Les places restantes sont attribuées aux tâches dans l'ordre chronologique. */
    for (const group of selectedGroups) {
      while (group.visibleCount < group.dateTasks.length) {
        const nextTaskHeight = this.taskGap + this.taskRowHeight;
        if (usedHeight + nextTaskHeight > availableHeight) break;
        group.visibleCount++;
        usedHeight += nextTaskHeight;
      }
    }

    let displayedCount = selectedGroups.reduce((total, group) => total + group.visibleCount, 0);
    let hiddenCount = totalTaskCount - displayedCount;

    /* Le compteur est une ligne compacte. On libère une tâche si nécessaire. */
    if (hiddenCount > 0 && selectedGroups.length > 0) {
      const counterHeight = this.taskGap + this.moreTasksHeight;
      while (usedHeight + counterHeight > availableHeight) {
        const removableGroup = [...selectedGroups]
          .reverse()
          .find((group) => group.visibleCount > 1);
        if (removableGroup) {
          removableGroup.visibleCount--;
          displayedCount--;
          hiddenCount++;
          usedHeight -= this.taskGap + this.taskRowHeight;
          continue;
        }

        if (selectedGroups.length <= 1) break;

        const removedGroup = selectedGroups.pop();
        if (!removedGroup) break;
        displayedCount -= removedGroup.visibleCount;
        hiddenCount += removedGroup.visibleCount;
        usedHeight -=
          this.groupGap + this.dayHeaderHeight + this.groupInnerGap + this.taskRowHeight;
      }
    }

    const result: TimelineGroup[] = selectedGroups.map((group, index) => {
      const selectedTasks = group.dateTasks.slice(0, group.visibleCount);
      const groupDate = new Date(selectedTasks[0].dateDebut);

      return {
        key: this.buildGroupKey(groupDate),
        label: this.buildGroupLabel(groupDate),
        dateLabel: this.formatLongDate(groupDate),
        events: selectedTasks.map((tache) => this.toTimelineEvent(tache, typeLabels)),
        hiddenCount: index === selectedGroups.length - 1 ? hiddenCount : 0,
      };
    });

    return result;
  }

  private toTimelineEvent(tache: TacheResponse, typeLabels: Map<number, string>): TimelineEvent {
    const typeCode = tache.typeTache?.code?.toUpperCase() ?? 'TACHE';

    const displayConfig = TYPE_DISPLAY_CONFIG[typeCode] ?? DEFAULT_DISPLAY_CONFIG;

    const typeLabel = typeLabels.get(tache.typeTache.id) ?? tache.typeTache.libelle;

    return {
      id: tache.id,

      statusCode: tache.statut?.code?.toUpperCase() ?? 'A_FAIRE',

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
}

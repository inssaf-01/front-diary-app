import {
  afterEveryRender,
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
import {
  AjoutTacheComponent,
  CreateTaskPayload,
  TaskParameterOption,
} from '../calendrier/ajout-tache/ajout-tache';

import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MainTopbarComponent } from '../../shared/layout/main-topbar/main-topbar';

import { HomeCalendarService, ParametreResponse, TacheResponse } from './home-calendar.service';

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
  overdue?: boolean;
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
  imports: [CommonModule, MainTopbarComponent, AjoutTacheComponent],
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


  @ViewChild('timelineElement') private timelineElement?: ElementRef<HTMLElement>;

  // Render a bounded batch first, then measure how many complete cards fit.
  // Starting with one card can leave the layout without enough content to measure.
  pageSize = 12;
  currentPage = 1;
  totalTasks = 0;
  includeOverdue = true;
  get totalPages(): number { return Math.max(1, Math.ceil(this.totalTasks / this.pageSize)); }
  get pageNumbers(): number[] {
    const start = Math.max(1, Math.min(this.currentPage - 2, this.totalPages - 4));
    return Array.from({length: Math.min(5, this.totalPages)}, (_, i) => start + i);
  }
  changePage(page: number): void {
    if (this.calendarLoading || this.statusesSaving) return;
    this.currentPage = Math.max(1, Math.min(this.totalPages, page));
    this.loadCalendar();
  }
  toggleOverdue(): void {
    this.includeOverdue = !this.includeOverdue;
    this.currentPage = 1;
    this.capacityLimit = 50;
    this.loadCalendar();
  }
  constructor() {
    afterEveryRender(() => this.schedulePageFit());
  }
  private capacityLimit = 50;
  private layoutFrame = 0;
  private schedulePageFit(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => this.fitPage());
  }
  private fitPage(): void {
    if (this.calendarLoading || this.calendarError || this.destroyRef.destroyed) return;
    const list = this.timelineElement?.nativeElement.querySelector('.timeline-list') as HTMLElement | null;
    const rows = list ? Array.from(list.querySelectorAll<HTMLElement>('.event-row')) : [];
    if (!list || !rows.length || list.clientHeight <= 0) return;
    const bounds = list.getBoundingClientRect();
    const pagination = this.timelineElement?.nativeElement.querySelector('.task-pagination');
    const paginationTop = pagination?.getBoundingClientRect().top;
    const bottom = Math.min(bounds.bottom, paginationTop && paginationTop > bounds.top ? paginationTop : bounds.bottom)
      - parseFloat(getComputedStyle(list).paddingBottom || '0');
    // A grid row may shrink while its card still paints outside it.
    // Measure the visible card as well as the row, including day headings above it.
    const rowBottom = (row: HTMLElement) => Math.max(row.getBoundingClientRect().bottom,
      row.querySelector('.event-card')?.getBoundingClientRect().bottom ?? 0);
    const firstOverflow = rows.findIndex(row => rowBottom(row) > bottom + 1);
    const fitting = firstOverflow < 0 ? rows.length : firstOverflow;
    let size = this.pageSize;
    if (fitting < rows.length) {
      this.capacityLimit = Math.max(1, Math.min(this.capacityLimit, fitting));
      size = Math.max(1, fitting);
    } else if (rows.length === this.pageSize && this.totalTasks > this.pageSize && this.pageSize < this.capacityLimit) {
      const last = rows[rows.length - 1].getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(rows[0].parentElement!).rowGap) || 8;
      const spare = bottom - rowBottom(rows[rows.length - 1]);
      if (spare >= last.height + gap) {
        size = Math.min(this.capacityLimit, this.totalTasks, this.pageSize + Math.max(1, Math.floor(spare / (last.height + gap))));
      }
    }
    if (size === this.pageSize) return;
    const offset = (this.currentPage - 1) * this.pageSize;
    this.pageSize = size;
    this.currentPage = Math.floor(offset / size) + 1;
    this.loadCalendar();
  }
  private requestVersion = 0;
  private periodDay = '';
  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const list = this.timelineElement?.nativeElement.querySelector('.timeline-list');
    const observer = typeof ResizeObserver !== 'undefined' && list ? new ResizeObserver(([entry]) => {
      this.capacityLimit = 50;
      this.schedulePageFit();
    }) : null;
    if (observer && list) observer.observe(list);
    this.periodDay = this.toLocalDateKey(new Date());
    const timer = setInterval(() => {
      const day = this.toLocalDateKey(new Date());
      if (day !== this.periodDay) {
        this.periodDay = day;
        this.currentPage = 1;
        this.week = this.buildCurrentWeek();
        this.loadCalendar();
      }
    }, 30000);
    this.destroyRef.onDestroy(() => { observer?.disconnect(); clearInterval(timer); if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.layoutFrame); });
  }
  private calendarTasks: TacheResponse[] = [];
  private calendarTypes: ParametreResponse[] = [];
  pendingStatuses = new Map<string, string>();
  statusesSaving = false;
  statusMessage = '';
  statusSaveError = false;

  statusOptions: Array<{ id: number; code: string; label: string }> = [];
  taskTypes: TaskParameterOption[] = [];
  taskStatuses: TaskParameterOption[] = [];
  taskPriorities: TaskParameterOption[] = [];
  editingTask: TacheResponse | null = null;

  private parameterOptions(
    items: ParametreResponse[],
    kind: 'type' | 'status' | 'priority',
  ): TaskParameterOption[] {
    // Presentation only: IDs and labels always come from the parameter API.
    const appearance: Record<string, [string, string]> = {
      TACHE: ['pi-check-square', '#7193ff'],
      REUNION: ['pi-users', '#58c7ff'],
      EVENEMENT: ['pi-calendar', '#8e72ff'],
      ANNIVERSAIRE: ['pi-gift', '#f36eae'],
      COURSES: ['pi-shopping-cart', '#f4a261'],
      A_FAIRE: ['pi-circle', '#7898c8'],
      EN_COURS: ['pi-play-circle', '#7b79ff'],
      TERMINEE: ['pi-check-circle', '#66e6c2'],
      ANNULEE: ['pi-times-circle', '#d47d9d'],
      BASSE: ['pi-arrow-down', '#7197c8'],
      NORMALE: ['pi-minus', '#5f8dff'],
      HAUTE: ['pi-arrow-up', '#f2a45f'],
      URGENTE: ['pi-bolt', '#f06f91'],
    };
    return items.map((item) => ({
      ...item,
      icon: appearance[item.code]
        ? 'pi ' + appearance[item.code][0]
        : kind === 'type'
          ? 'pi ' + (TYPE_DISPLAY_CONFIG[item.code]?.icon ?? DEFAULT_DISPLAY_CONFIG.icon)
          : kind === 'status'
            ? 'pi pi-circle'
            : 'pi pi-flag',
      color: appearance[item.code]?.[1] ?? '#7193ff',
    }));
  }

  currentUser: AuthenticatedUser | null = null;

  user: HomeUser = {
    firstName: this.currentUser?.username ?? 'Inssaf',

    fullName: this.currentUser?.username ?? 'Inssaf',

    avatarUrl: 'assets/images/avatar-inssaf.jpg',

    status: 'Un jour plus aligné',
  };

  taskDialogVisible = false;
  savingTask = false;
  taskSaveError = '';

  openTaskDialog(): void {
    this.editingTask = null;
    this.taskSaveError = '';
    this.taskDialogVisible = true;
    if (!this.taskTypes.length || !this.taskStatuses.length) {
      this.calendarService
        .loadParameters()
        .pipe(first(), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: ({ typesTache, statuts, priorites }) => {
            this.taskTypes = this.parameterOptions(typesTache, 'type');
            this.taskStatuses = this.parameterOptions(statuts, 'status');
            this.taskPriorities = this.parameterOptions(priorites, 'priority');
            this.changeDetectorRef.detectChanges();
          },
          error: () => {
            this.taskSaveError =
              'Impossible de charger les listes du formulaire. Fermez puis rouvrez le formulaire pour réessayer.';
            this.changeDetectorRef.detectChanges();
          },
        });
    }
  }

  editTask(event: TimelineEvent): void {
    if (this.savingTask || this.statusesSaving || this.pendingStatuses.size) return;
    this.editingTask = this.calendarTasks.find((task) => task.id === event.id) ?? null;
    if (!this.editingTask) return;
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
    defer(() =>
      this.editingTask
        ? this.calendarService.updateTask(this.editingTask.id, task)
        : this.calendarService.createTask(task),
    )
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

  }

  private loadCalendar(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const version = ++this.requestVersion;
    this.calendarLoading = true;
    this.calendarError = false;
    this.changeDetectorRef.markForCheck();
    defer(() => {
      const start = this.startOfDay(new Date());
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return this.calendarService.loadHome(start, end, this.includeOverdue, this.currentPage - 1, this.pageSize);
    })
      .pipe(
        first(),
        map(({ typesTache, statuts, priorites, taches, totalElements }) => {
          if (version !== this.requestVersion) return null;
          this.totalTasks = totalElements;
          this.taskTypes = this.parameterOptions(typesTache, 'type');
          this.taskStatuses = this.parameterOptions(statuts, 'status');
          this.taskPriorities = this.parameterOptions(priorites, 'priority');
          this.statusOptions = statuts.map((item) => ({
            id: item.id,
            code: item.code,
            label: item.libelle,
          }));
          const tasks = taches;
          return { typesTache, tasks, groups: this.buildTimelineGroups(tasks, typesTache) };
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (version !== this.requestVersion) return;
          this.calendarLoading = false;
          // Apply the completed request to this OnPush view without waiting for an interaction.
          if (!this.destroyRef.destroyed) { this.changeDetectorRef.detectChanges(); this.schedulePageFit(); }
        }),
      )
      .subscribe({
        next: (data) => {
          if (!data || version !== this.requestVersion) return;
          const {typesTache, tasks, groups} = data;
          this.calendarTypes = typesTache;
          this.calendarTasks = tasks;
          this.groups = groups;
          if (this.currentPage > this.totalPages) {
            this.currentPage = this.totalPages;
            this.loadCalendar();
          }
        },
        error: (error) => {
          if (version !== this.requestVersion) return;
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

    const originalStatus = this.statusCodeFor(
      this.calendarTasks.find((task) => task.id === event.id),
    );
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
    const originalStatus = this.statusCodeFor(savedTask) ?? '';
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
    defer(() =>
      this.calendarService.updateStatuses(
        modifications.map((change) => {
          const status = this.statusOptions.find((item) => item.code === change.statutCode);
          if (!status) throw new Error('Statut indisponible');
          return { tacheId: change.tacheId, statutId: status.id };
        }),
      ),
    )
      .pipe(
        first(),
        map((updatedTasks) => {
          // Validate before committing local state: a malformed response must remain retryable.
          if (!Array.isArray(updatedTasks) || updatedTasks.length !== modifications.length) {
            throw new Error('Invalid status update response');
          }
          if (updatedTasks.some(task => !Number.isFinite(new Date(task.dateDebut).getTime()))) {
            throw new Error('Invalid task date');
          }
          const updatedById = new Map(updatedTasks.map((task) => [task.id, task]));
          if (
            updatedById.size !== modifications.length ||
            modifications.some(
              (change) => this.statusCodeFor(updatedById.get(change.tacheId)) !== change.statutCode,
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
          if (modifications.some(change => change.statutCode === 'TERMINEE' || change.statutCode === 'ANNULEE')) this.loadCalendar();
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

    const now = new Date();
    const start = this.startOfDay(now);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const visibleTasks = taches.filter((task) => {
      const status = this.statusCodeFor(task);
      return (status === 'A_FAIRE' || status === 'EN_COURS') &&
        new Date(task.dateDebut) < end &&
        (new Date(task.dateDebut) >= start || this.includeOverdue);
    }).sort((a, b) => new Date(a.dateDebut).getTime() - new Date(b.dateDebut).getTime()
      || this.getPriorityOrder(a) - this.getPriorityOrder(b) || a.id.localeCompare(b.id));


    const tasksByDate = new Map<string, TacheResponse[]>();
    for (const task of visibleTasks) {
      const key = this.toLocalDateKey(new Date(task.dateDebut));
      const tasks = tasksByDate.get(key) ?? [];
      tasks.push(task);
      tasksByDate.set(key, tasks);
    }
    return Array.from(tasksByDate).map(([key, tasks]) => ({
      key: this.buildGroupKey(new Date(tasks[0].dateDebut)),
      label: (new Date(tasks[0].dateDebut) < start ? 'En retard · ' : '') + this.buildGroupLabel(new Date(tasks[0].dateDebut)),
      dateLabel: this.formatLongDate(new Date(tasks[0].dateDebut)),
      events: tasks.map(task => this.toTimelineEvent(task, typeLabels)),
      hiddenCount: 0,
    }));
  }

  private isOverdue(task: TacheResponse, now = new Date()): boolean {
    const deadline = new Date(task.dateFin ?? task.dateDebut);
    if (task.touteLaJournee) deadline.setHours(23, 59, 59, 999);
    return deadline.getTime() < now.getTime();
  }

  private toTimelineEvent(tache: TacheResponse, typeLabels: Map<number, string>): TimelineEvent {
    const typeCode = this.taskTypes.find((item) => item.id === tache.typeTacheId)?.code ?? 'TACHE';

    const displayConfig = TYPE_DISPLAY_CONFIG[typeCode] ?? DEFAULT_DISPLAY_CONFIG;

    const typeLabel = typeLabels.get(tache.typeTacheId) ?? 'Type indisponible';

    return {
      id: tache.id,
      overdue: this.isOverdue(tache),

      statusCode: this.statusCodeFor(tache) ?? 'A_FAIRE',

      time: tache.touteLaJournee ? 'Toute la journée' : this.formatTime(tache.dateDebut),

      title: tache.titre,

      subtitle: tache.details?.trim() || typeLabel || 'Aucun détail',

      icon: displayConfig.icon,

      tone: displayConfig.tone,

      duration: this.calculateDuration(tache.dateDebut, tache.dateFin, tache.touteLaJournee),

      badge: this.taskPriorities.find((item) => item.id === tache.prioriteId)?.libelle,
    };
  }

  private statusCodeFor(task: TacheResponse | undefined): string | undefined {
    return this.statusOptions.find((item) => item.id === task?.statutId)?.code;
  }

  private getPriorityOrder(tache: TacheResponse): number {
    const priorityCode = this.taskPriorities.find((item) => item.id === tache.prioriteId)?.code;

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

    if (difference < -7) return this.formatLongDate(date);
    if (difference < 0) return difference === -1 ? "Hier" : `Il y a ${-difference} jours`;
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

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { DatePipe, isPlatformBrowser, registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, defer, finalize, first, map, of, Subject, switchMap } from 'rxjs';
import { MainTopbarComponent } from '../../shared/layout/main-topbar/main-topbar';
import { HomeCalendarService, TacheRequest, TacheResponse } from '../home/home-calendar.service';
import { LoginService } from '../test-connexion/login.service';
import { AjoutTacheComponent, TaskParameterOption } from './ajout-tache/ajout-tache';
import { ParametreResponse } from './task-parameters.service';

registerLocaleData(localeFr);
interface JourCalendrier {
  date: Date;
  cle: string;
  dansLeMois: boolean;
}
interface CalendarTask extends TacheResponse {
  typeLabel: string;
  statusLabel: string;
  priorityLabel: string;
  statusCode: string;
  color: string;
}
interface TimedTask {
  task: CalendarTask;
  top: number;
  height: number;
  left: number;
  width: number;
}

@Component({
  selector: 'app-calendrier',
  standalone: true,
  imports: [DatePipe, FormsModule, MainTopbarComponent, AjoutTacheComponent],
  templateUrl: './calendrier.html',
  styleUrl: './calendrier.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendrierComponent implements OnInit {
  private readonly api = inject(HomeCalendarService);
  private readonly login = inject(LoginService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platform = inject(PLATFORM_ID);
  private readonly reload = new Subject<void>();
  private loadedRange = '';

  dateSelectionnee = this.startOfDay(new Date());
  moisAffiche = new Date(this.dateSelectionnee.getFullYear(), this.dateSelectionnee.getMonth(), 1);
  user = { firstName: '', fullName: '', avatarUrl: '', status: '' };
  filtreStatut: number | null = null;
  filtrePriorite: number | null = null;
  filtreType: number | null = null;
  recherche = '';
  private readonly calendarState = signal<{ taches: TacheResponse[]; loading: boolean; error: string }>({
    taches: [], loading: true, error: '',
  });
  get taches(): TacheResponse[] { return this.calendarState().taches; }
  set taches(taches: TacheResponse[]) { this.calendarState.update(state => ({ ...state, taches })); }
  get loading(): boolean { return this.calendarState().loading; }
  get error(): string { return this.calendarState().error; }
  types: TaskParameterOption[] = [];
  statuts: TaskParameterOption[] = [];
  priorites: TaskParameterOption[] = [];
  referencesLoading = false;
  referenceError = '';
  actionError = '';
  taskDialogVisible = false;
  savingTask = false;
  taskSaveError = '';
  editingTask: TacheResponse | null = null;
  savingStatuses = new Set<string>();
  readonly heures = Array.from({ length: 24 }, (_, index) => index);
  readonly joursSemaine = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat('fr', { weekday: 'short' }).format(new Date(2024, 0, 1 + index)),
  );

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platform)) return;
    const current = this.login.getCurrentUser();
    this.user = {
      firstName: current?.username ?? '',
      fullName: current?.username ?? '',
      status: current?.email ?? '',
      avatarUrl: '',
    };
    this.loadParameters();
    this.reload
      .pipe(
        switchMap(() => {
          const days = this.joursDuMois;
          const start = days[0].date;
          const end = this.addDays(days[days.length - 1].date, 1);
          this.calendarState.set({ taches: [], loading: true, error: '' });
          this.loadedRange = this.cleDate(start);
          return this.api.getTasks(start, end, true).pipe(
            first(),
            map(taches => ({ taches, loading: false, error: '' })),
            catchError(() => of({ taches: [] as TacheResponse[], loading: false,
              error: 'Impossible de charger les tâches de cette période.' })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      // A signal read by the template schedules rendering even without any user interaction.
      .subscribe(state => this.calendarState.set(state));
    this.refresh();
  }

  private render(): void {
    if (!this.destroyRef.destroyed) this.cdr.detectChanges();
  }
  loadParameters(): void {
    if (this.referencesLoading) return;
    this.referencesLoading = true;
    this.referenceError = '';
    this.api
      .loadParameters()
      .pipe(
        first(),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.referencesLoading = false;
          this.render();
        }),
      )
      .subscribe({
        next: (data) => {
          this.types = this.options(data.typesTache);
          this.statuts = this.options(data.statuts);
          this.priorites = this.options(data.priorites);
        },
        error: () => {
          this.referenceError = 'Impossible de charger les types, statuts et priorités.';
        },
      });
  }
  refresh(): void {
    if (this.referenceError) this.loadParameters();
    this.reload.next();
  }
  private options(items: ParametreResponse[]): TaskParameterOption[] {
    return items.map((item) => ({ ...item, icon: 'pi pi-calendar', color: this.color(item.id) }));
  }
  color(id: number): string {
    const colors = ['#b08aff', '#5ce3ed', '#ffc36e', '#7fe3bb', '#ff9ac8'];
    return colors[Math.abs(id) % colors.length];
  }
  get joursDuMois(): JourCalendrier[] {
    const first = new Date(this.moisAffiche.getFullYear(), this.moisAffiche.getMonth(), 1);
    const start = this.addDays(first, -((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const date = this.addDays(start, i);
      return {
        date,
        cle: this.cleDate(date),
        dansLeMois: date.getMonth() === this.moisAffiche.getMonth(),
      };
    });
  }
  get semaineSelectionnee(): Date[] {
    const start = this.addDays(this.dateSelectionnee, -((this.dateSelectionnee.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => this.addDays(start, i));
  }
  private occursOn(task: TacheResponse, day: Date): boolean {
    const start = new Date(task.dateDebut);
    const next = this.addDays(day, 1);
    if (task.touteLaJournee) {
      return (
        this.cleDate(start) <= this.cleDate(day) &&
        this.cleDate(new Date(task.dateFin ?? task.dateDebut)) >= this.cleDate(day)
      );
    }
    return (
      start < next && (start >= day || (task.dateFin !== null && new Date(task.dateFin) > day))
    );
  }
  private matches(task: TacheResponse): boolean {
    const query = this.recherche.trim().toLocaleLowerCase('fr');
    return (
      (this.filtreStatut === null || task.statutId === this.filtreStatut) &&
      (this.filtrePriorite === null || task.prioriteId === this.filtrePriorite) &&
      (this.filtreType === null || task.typeTacheId === this.filtreType) &&
      (!query || (task.titre + ' ' + (task.details ?? '')).toLocaleLowerCase('fr').includes(query))
    );
  }
  tachesPourDate(key: string): CalendarTask[] {
    const day = new Date(key + 'T00:00:00');
    return this.taches
      .filter((task) => this.occursOn(task, day) && this.matches(task))
      .sort(
        (a, b) =>
          Number(b.touteLaJournee) - Number(a.touteLaJournee) ||
          new Date(a.dateDebut).getTime() - new Date(b.dateDebut).getTime(),
      )
      .map((task) => ({
        ...task,
        typeLabel:
          this.types.find((item) => item.id === task.typeTacheId)?.libelle ?? 'Type indisponible',
        statusLabel:
          this.statuts.find((item) => item.id === task.statutId)?.libelle ?? 'Statut indisponible',
        priorityLabel: this.priorites.find((item) => item.id === task.prioriteId)?.libelle ?? '',
        statusCode: this.statuts.find((item) => item.id === task.statutId)?.code ?? '',
        color: this.color(task.typeTacheId),
      }));
  }
  get tachesDuJour(): CalendarTask[] {
    return this.tachesPourDate(this.cleDate(this.dateSelectionnee));
  }
  get touteLaJournee(): CalendarTask[] {
    return this.tachesDuJour.filter((task) => task.touteLaJournee);
  }
  get nombreTachesDuJour(): number {
    return this.taches.filter((task) => this.occursOn(task, this.dateSelectionnee)).length;
  }
  get evenementsHoraires(): TimedTask[] {
    const day = this.dateSelectionnee;
    const next = this.addDays(day, 1);
    const result: TimedTask[] = [];
    let group: Array<TimedTask & { lane: number }> = [];
    let laneEnds: number[] = [];
    let groupEnd = 0;
    const flush = () => {
      for (const event of group)
        result.push({
          ...event,
          left: (event.lane * 100) / laneEnds.length,
          width: 100 / laneEnds.length,
        });
      group = [];
      laneEnds = [];
    };
    for (const task of this.tachesDuJour.filter((task) => !task.touteLaJournee)) {
      const start = new Date(task.dateDebut);
      const end = task.dateFin ? new Date(task.dateFin) : null;
      const startMinute = start < day ? 0 : start.getHours() * 60 + start.getMinutes();
      const endMinute = end
        ? end >= next
          ? 1440
          : end.getHours() * 60 + end.getMinutes()
        : startMinute + 30;
      const top = (startMinute * 64) / 60;
      const bottom = Math.min(1536, Math.max((endMinute * 64) / 60, top + 24));
      if (group.length && top >= groupEnd) flush();
      if (!group.length) groupEnd = 0;
      let lane = laneEnds.findIndex((value) => value <= top);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = bottom;
      groupEnd = Math.max(groupEnd, bottom);
      group.push({ task, top, height: bottom - top, left: 0, width: 100, lane });
    }
    flush();
    return result;
  }
  selectionnerDate(date: Date): void {
    this.dateSelectionnee = this.startOfDay(date);
    this.moisAffiche = new Date(date.getFullYear(), date.getMonth(), 1);
    if (this.cleDate(this.joursDuMois[0].date) !== this.loadedRange) this.refresh();
  }
  changerMois(delta: number): void {
    this.selectionnerDate(
      new Date(this.moisAffiche.getFullYear(), this.moisAffiche.getMonth() + delta, 1),
    );
  }
  changerSemaine(delta: number): void {
    this.selectionnerDate(this.addDays(this.dateSelectionnee, delta * 7));
  }
  allerAujourdhui(): void {
    this.selectionnerDate(new Date());
  }
  choisirDate(value: string): void {
    if (value) this.selectionnerDate(new Date(value + 'T00:00:00'));
  }
  estSelectionnee(date: Date): boolean {
    return this.cleDate(date) === this.cleDate(this.dateSelectionnee);
  }
  estAujourdhui(date: Date): boolean {
    return this.cleDate(date) === this.cleDate(new Date());
  }
  horaire(task: TacheResponse): string {
    if (task.touteLaJournee) return 'Toute la journée';
    const format = (value: string) =>
      new Intl.DateTimeFormat('fr', {
        hour: '2-digit',
        minute: '2-digit',
        ...(this.cleDate(new Date(value)) !== this.cleDate(this.dateSelectionnee)
          ? ({ day: 'numeric', month: 'short' } as const)
          : {}),
      }).format(new Date(value));
    return format(task.dateDebut) + (task.dateFin ? ' – ' + format(task.dateFin) : '');
  }
  resetFilters(): void {
    this.filtreStatut = null;
    this.filtrePriorite = null;
    this.filtreType = null;
    this.recherche = '';
  }
  openTaskDialog(task: TacheResponse | null = null): void {
    if (this.savingTask || (task && this.savingStatuses.has(task.id))) return;
    this.editingTask = task;
    this.taskSaveError = '';
    this.taskDialogVisible = true;
    if (this.referenceError || !this.types.length || !this.statuts.length) this.loadParameters();
  }
  closeTaskDialog(): void {
    if (!this.savingTask) this.taskDialogVisible = false;
  }
  saveTask(payload: TacheRequest): void {
    if (this.savingTask) return;
    this.savingTask = true;
    this.taskSaveError = '';
    defer(() =>
      this.editingTask
        ? this.api.updateTask(this.editingTask.id, payload)
        : this.api.createTask(payload),
    )
      .pipe(
        first(),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.savingTask = false;
          this.render();
        }),
      )
      .subscribe({
        next: () => {
          this.taskDialogVisible = false;
          this.refresh();
        },
        error: () => {
          this.taskSaveError =
            'Enregistrement impossible. Vos informations sont conservées, réessayez.';
        },
      });
  }
  changerStatut(task: TacheResponse, statutId: number): void {
    if (this.savingStatuses.has(task.id) || task.statutId === statutId) return;
    if (!this.statuts.some((item) => item.id === statutId)) return;
    this.savingStatuses.add(task.id);
    this.actionError = '';
    this.api
      .updateStatuses([{ tacheId: task.id, statutId }])
      .pipe(
        first(),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.savingStatuses.delete(task.id);
          this.render();
        }),
      )
      .subscribe({
        next: (updated) => {
          this.taches = this.taches.map(
            (item) => updated.find((value) => value.id === item.id) ?? item,
          );
        },
        error: () => {
          this.actionError = 'Le statut n’a pas été enregistré. Réessayez.';
        },
      });
  }
  selectStatus(task: TacheResponse, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const target = Number(select.value);
    select.value = String(task.statutId);
    this.changerStatut(task, target);
  }
  cleDate(date: Date): string {
    return (
      date.getFullYear() +
      '-' +
      String(date.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(date.getDate()).padStart(2, '0')
    );
  }
  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}

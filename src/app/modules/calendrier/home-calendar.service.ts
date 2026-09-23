import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpContext } from '@angular/common/http';
import { KEEP_PENDING_EDITS } from '../../core/interceptors/auth.context';
import { catchError, forkJoin, Observable, of, switchMap, tap } from 'rxjs';
import type { CreateTaskPayload } from './ajout-tache/ajout-tache';

import { API_CONFIG } from '../../core/config/api.config';

export interface ParametreResponse {
  id: number;
  categorie: string;
  code: string;
  libelle: string;
  ordre: number;
}

export interface TacheParametreResponse {
  id: number;
  code: string;
  libelle: string;
}

export interface TacheResponse {
  id: string;
  typeTache: TacheParametreResponse;
  statut: TacheParametreResponse;
  priorite: TacheParametreResponse | null;
  titre: string;
  details: string | null;
  dateDebut: string;
  dateFin: string | null;
  touteLaJournee: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStatusChange {
  tacheId: string;
  statutCode: string;
}

export interface HomeCalendarData {
  typesTache: ParametreResponse[];
  taches: TacheResponse[];
}

@Injectable({
  providedIn: 'root',
})
export class HomeCalendarService {
  private readonly http = inject(HttpClient);

  createTask(task: CreateTaskPayload): Observable<TacheResponse> {
    const context = new HttpContext().set(KEEP_PENDING_EDITS, true);
    const parameters = (categorie: string) =>
      this.http.get<ParametreResponse[]>(`${API_CONFIG.baseUrl}/parametres`, {
        params: new HttpParams().set('categorie', categorie),
        context,
      });

    return forkJoin({
      types: parameters('TYPE_TACHE'),
      statuts: parameters('STATUT_TACHE'),
      priorites: parameters('PRIORITE_TACHE'),
    }).pipe(
      switchMap(({ types, statuts, priorites }) => {
        const resolveId = (options: ParametreResponse[], code: string): number => {
          const option = options.find((item) => item.code === code);
          if (!option) throw new Error(`Paramètre indisponible : ${code}`);
          return option.id;
        };
        const toInstant = (date: string, time: string | null): string =>
          new Date(`${date}T${task.touteLaJournee ? '00:00' : time || '00:00'}:00`).toISOString();

        return this.http.post<TacheResponse>(
          `${API_CONFIG.baseUrl}/taches`,
          {
            typeTacheId: resolveId(types, task.typeId),
            statutId: resolveId(statuts, task.statutId),
            prioriteId: resolveId(priorites, task.prioriteId),
            titre: task.titre,
            details: task.description,
            dateDebut: toInstant(task.dateDebut, task.heureDebut),
            dateFin: toInstant(task.dateFin, task.heureFin),
            touteLaJournee: task.touteLaJournee,
          },
          { context },
        );
      }),
    );
  }

  updateStatuses(modifications: TaskStatusChange[]): Observable<TacheResponse[]> {
    return this.http.patch<TacheResponse[]>(
      `${API_CONFIG.baseUrl}/taches/statuts`,
      { modifications },
      { context: new HttpContext().set(KEEP_PENDING_EDITS, true) },
    );
  }

  loadCalendar(dateDebut: Date, dateFin: Date): Observable<HomeCalendarData> {
    const calendarParams = new HttpParams()
      .set('dateDebut', dateDebut.toISOString())
      .set('dateFin', dateFin.toISOString());

    const typeParams = new HttpParams().set('categorie', 'TYPE_TACHE');

    return forkJoin({
      typesTache: this.http
        .get<ParametreResponse[]>(`${API_CONFIG.baseUrl}/parametres`, {
          params: typeParams,
        })
        .pipe(catchError(() => of([]))),

      taches: this.http
        .get<TacheResponse[]>(`${API_CONFIG.baseUrl}/taches/calendrier`, {
          params: calendarParams,
        })
        .pipe(tap((taches) => console.log('[CALENDRIER] tâches reçues =', taches))),
    });
  }
}

import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpContext } from '@angular/common/http';
import { KEEP_PENDING_EDITS } from '../../core/interceptors/auth.context';
import { catchError, forkJoin, Observable, of } from 'rxjs';

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

      taches: this.http.get<TacheResponse[]>(`${API_CONFIG.baseUrl}/taches/calendrier`, {
        params: calendarParams,
      }),
    });
  }
}

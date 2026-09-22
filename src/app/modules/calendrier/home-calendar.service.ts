import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { forkJoin, Observable } from 'rxjs';

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

export interface HomeCalendarData {
  typesTache: ParametreResponse[];
  taches: TacheResponse[];
}

@Injectable({
  providedIn: 'root',
})
export class HomeCalendarService {
  private readonly http = inject(HttpClient);

  loadCalendar(dateDebut: Date, dateFin: Date): Observable<HomeCalendarData> {
    const calendarParams = new HttpParams()
      .set('dateDebut', dateDebut.toISOString())
      .set('dateFin', dateFin.toISOString());

    const typeParams = new HttpParams().set('categorie', 'TYPE_TACHE');

    return forkJoin({
      typesTache: this.http.get<ParametreResponse[]>(`${API_CONFIG.baseUrl}/parametres`, {
        params: typeParams,
      }),

      taches: this.http.get<TacheResponse[]>(`${API_CONFIG.baseUrl}/taches/calendrier`, {
        params: calendarParams,
      }),
    });
  }
}

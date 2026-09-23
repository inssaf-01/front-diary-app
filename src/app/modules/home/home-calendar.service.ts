import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpContext } from '@angular/common/http';
import { forkJoin, map, Observable } from 'rxjs';
import { KEEP_PENDING_EDITS } from '../../core/interceptors/auth.context';
import { API_CONFIG } from '../../core/config/api.config';
import { TaskParameters, TaskParametersService } from '../calendrier/task-parameters.service';
export type { ParametreResponse } from '../calendrier/task-parameters.service';

export interface TacheRequest {
  typeTacheId: number;
  statutId: number;
  prioriteId: number | null;
  titre: string;
  details: string | null;
  dateDebut: string;
  dateFin: string | null;
  touteLaJournee: boolean;
}
export interface TacheResponse {
  id: string;
  typeTacheId: number;
  statutId: number;
  prioriteId: number | null;
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
  statutId: number;
}
export interface HomeCalendarData extends TaskParameters {
  taches: TacheResponse[];
}
@Injectable({ providedIn: 'root' })
export class HomeCalendarService {
  private readonly http = inject(HttpClient);
  private readonly parameters = inject(TaskParametersService);

  loadParameters(): Observable<TaskParameters> {
    return this.parameters.load();
  }

  createTask(task: TacheRequest): Observable<TacheResponse> {
    return this.http.post<TacheResponse>(API_CONFIG.baseUrl + '/taches', task, {
      context: new HttpContext().set(KEEP_PENDING_EDITS, true),
    });
  }
  updateTask(id: string, task: TacheRequest): Observable<TacheResponse> {
    return this.http.put<TacheResponse>(API_CONFIG.baseUrl + '/taches/' + id, task, {
      context: new HttpContext().set(KEEP_PENDING_EDITS, true),
    });
  }
  updateStatuses(modifications: TaskStatusChange[]): Observable<TacheResponse[]> {
    return this.http.patch<TacheResponse[]>(
      API_CONFIG.baseUrl + '/taches/statuts',
      { modifications },
      {
        context: new HttpContext().set(KEEP_PENDING_EDITS, true),
      },
    );
  }
  loadCalendar(dateDebut: Date, dateFin: Date, vueComplete = false): Observable<HomeCalendarData> {
    return forkJoin({
      parameters: this.parameters.load(),
      taches: this.getTasks(dateDebut, dateFin, vueComplete),
    }).pipe(map(({ parameters, taches }) => ({ ...parameters, taches })));
  }

  getTasks(dateDebut: Date, dateFin: Date, vueComplete = false): Observable<TacheResponse[]> {
    return this.http.get<TacheResponse[]>(API_CONFIG.baseUrl + '/taches/calendrier', {
      params: new HttpParams()
        .set('dateDebut', dateDebut.toISOString())
        .set('dateFin', dateFin.toISOString())
        .set('vueComplete', vueComplete),
    });
  }
}

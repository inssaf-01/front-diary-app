import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { map, Observable, shareReplay } from 'rxjs';
import { API_CONFIG } from '../../core/config/api.config';
import { KEEP_PENDING_EDITS } from '../../core/interceptors/auth.context';

export interface ParametreResponse {
  id: number;
  categorie: string;
  code: string;
  libelle: string;
  ordre: number;
}
export interface TaskParameters {
  typesTache: ParametreResponse[];
  statuts: ParametreResponse[];
  priorites: ParametreResponse[];
}
@Injectable({ providedIn: 'root' })
export class TaskParametersService {
  private readonly http = inject(HttpClient);
  private cached?: Observable<TaskParameters>;
  private expiresAt = 0;

  load(): Observable<TaskParameters> {
    if (!this.cached || Date.now() >= this.expiresAt) {
      this.expiresAt = Date.now() + 5 * 60_000;
      this.cached = this.http
        .get<ParametreResponse[]>(API_CONFIG.baseUrl + '/parametres', {
          context: new HttpContext().set(KEEP_PENDING_EDITS, true),
        })
        .pipe(
          map((items) => ({
            typesTache: items.filter((item) => item.categorie === 'TYPE_TACHE'),
            statuts: items.filter((item) => item.categorie === 'STATUT_TACHE'),
            priorites: items.filter((item) => item.categorie === 'PRIORITE_TACHE'),
          })),
          shareReplay({ bufferSize: 1, refCount: true }),
        );
    }
    return this.cached;
  }
}

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { finalize, tap, Observable } from 'rxjs';
import { Aliment, RepasResponseDTO } from './aliment.model';
import { API_CONFIG } from '../../core/config/api.config';
import { getFoodIcon } from './food-assets.helper';
export interface AlimentationDashboard {
  tousLesAliments: Aliment[];
  alimentsEnStock: Aliment[];
  alimentsAAcheter: Aliment[];
  repas: Array<{
    id: string;
    nom: string;
    description?: string;
    typeRepas?: string;
    ingredients: Array<{ alimentId: string; nomAliment: string; quantite: number; unite: string }>;
  }>;
}
@Injectable({ providedIn: 'root' })
export class AlimentationService {
  private readonly http = inject(HttpClient);
  readonly foods = signal<Aliment[]>([]);
  readonly recipes = signal<RepasResponseDTO[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal('');
  loadDashboard(userId?: string): void {
    if (!userId) {
      this.loadError.set('ID utilisateur non fourni.');
      return;
    }

    this.foods.set([]);
    this.recipes.set([]);
    this.loadError.set('');
    this.isLoading.set(true);

    // Appel de la route avec /user/{userId}
    this.http
      .get<AlimentationDashboard>(`${API_CONFIG.baseUrl}/alimentation/dashboard/user/${userId}`)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (data) => {
          this.foods.set(
            data.tousLesAliments.map((a) => ({
              ...a,
              name: a.nom,
              unit: a.unite,
              quantity: a.quantiteStock,
              kcal: a.calories ?? 0,
              categories: a.categorie ? [a.categorie] : [],
              icon: getFoodIcon(a.nom, a.categorie),
              emplacement: a.quantiteStock > 0 ? 'stock' : 'courses',
            })),
          );
          this.recipes.set(
            data.repas.map((r) => ({ ...r, name: r.nom, icon: getFoodIcon(r.nom) })),
          );
        },
        error: () =>
          this.loadError.set('Impossible de charger les aliments et les repas. Réessayez.'),
      });
  }
  private refresh(): void {
    this.loadDashboard();
  }
  updateAlimentQuantity(
    id: string,
    quantite: number,
    emplacement: 'stock' | 'courses' = 'stock',
  ): Observable<Aliment> {
    return this.http
      .patch<Aliment>(`${API_CONFIG.baseUrl}/aliments/${id}/quantite`, { quantite, emplacement })
      .pipe(tap(() => this.refresh()));
  }
  moveToStock(id: string): Observable<Aliment> {
    return this.http
      .patch<Aliment>(`${API_CONFIG.baseUrl}/aliments/${id}/emplacement`, { emplacement: 'stock' })
      .pipe(tap(() => this.refresh()));
  }
  addAliment(a: Partial<Aliment>): Observable<Aliment> {
    return this.http
      .post<Aliment>(`${API_CONFIG.baseUrl}/aliments`, {
        nom: a.nom,
        description: a.description,
        unite: a.unite,
        quantiteStock: a.quantiteStock ?? 0,
        quantiteAAcheter: a.quantiteAAcheter ?? 0,
      })
      .pipe(tap(() => this.refresh()));
  }
}

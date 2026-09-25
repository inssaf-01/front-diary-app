import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MainTopbarComponent } from '../../shared/layout/main-topbar/main-topbar';
import { AlimentationService } from './alimentation.service';
import { Aliment, RepasResponseDTO } from './aliment.model';
import { LoginService } from '../test-connexion/login.service';
import {
  CoursesModalComponent,
  type Aliment as AlimentModal,
  type Repas as RepasModal,
} from './modal/courses-modal';

type Category = 'Protéines' | 'Glucides' | 'Lipides';

@Component({
  selector: 'app-courses-alimentation',
  standalone: true,
  imports: [FormsModule, MainTopbarComponent, CoursesModalComponent],
  templateUrl: './courses-alimentation.html',
  styleUrl: './courses-alimentation.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoursesAlimentationComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private loginService = inject(LoginService);
  private alimentationService = inject(AlimentationService);

  currentUser: any = null;

  user = {
    firstName: '',
    fullName: '',
    avatarUrl: 'assets/images/avatar-inssaf.jpg',
    status: 'Un jour plus aligné',
  };
  modalOuverte = false;
  readonly alimentsPourModal = computed<AlimentModal[]>(() =>
    this.foods().map((aliment) => ({
      id: aliment.id,
      nom: aliment.nom,
      unite: aliment.unite,
      quantiteStock: aliment.quantiteStock,
      quantiteAAcheter: aliment.quantiteAAcheter ?? 0,
      calories: aliment.calories ?? aliment.caloriesPar100g ?? null,
      proteinesG: aliment.proteinesG ?? null,
      glucidesG: aliment.glucidesG ?? null,
      lipidesG: aliment.lipidesG ?? null,
      fibresG: aliment.fibresG ?? null,
      baseNutritionnelle:
        aliment.baseNutritionnelle === '100g'
          ? 'POUR_100_G'
          : aliment.baseNutritionnelle === 'unité'
            ? 'PAR_UNITE'
            : null,
    })),
  );

  readonly repasPourModal = computed<RepasModal[]>(() =>
    this.recipes()
      .filter((repas): repas is RepasResponseDTO & { id: string } => !!repas.id)
      .map((repas) => ({
        id: repas.id,
        nom: repas.name,
        aliments: repas.ingredients ?? [],
      })),
  );

  addProduct(): void {
    this.modalOuverte = true;
  }
  // Signals issus du service
  readonly loadError = this.alimentationService.loadError;
  readonly isLoading = this.alimentationService.isLoading;
  retryLoading(): void {
    this.alimentationService.loadDashboard();
  }
  readonly foods = this.alimentationService.foods;
  readonly recipes = this.alimentationService.recipes;

  // État local de l'atelier repas
  readonly portions = signal<{ foodId: string; quantity: number }[]>([]);

  readonly categories: Category[] = ['Protéines', 'Glucides', 'Lipides'];

  readonly selectedCategory = signal<Category | null>(null);
  readonly search = signal<string>('');
  readonly selectedRecipe = signal<RepasResponseDTO | null>(null);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // 1. Récupération directe de l'utilisateur en session
    this.currentUser = this.loginService.getCurrentUser();

    if (this.currentUser && this.currentUser.id) {
      // 2. Mise à jour des informations d'affichage du Topbar

      this.user = {
        ...this.user,
        firstName: this.currentUser?.username ?? this.user.firstName,
        fullName: this.currentUser?.username ?? this.user.fullName,
      };
      console.log('user Id : ', this.currentUser.id);
      // 3. Chargement des aliments associés à l'ID réel en session
      this.alimentationService.loadDashboard(this.currentUser.id);
    }
  }

  // --- Computeds et Méthodes ---

  readonly stock = computed(() => this.filtered('stock'));
  readonly shopping = computed(() => this.filtered('courses'));

  readonly missing = computed(() =>
    this.portions().flatMap((p) => {
      const foodItem = this.foods().find((f) => f.id === p.foodId);
      if (!foodItem) return [];

      const currentQty = foodItem.quantity ?? foodItem.quantiteStock ?? 0;
      const isStock = foodItem.emplacement === 'stock';

      if (!isStock || currentQty < p.quantity) {
        return [
          {
            food: foodItem,
            quantity: Math.max(0, p.quantity - (isStock ? currentQty : 0)),
          },
        ];
      }
      return [];
    }),
  );

  readonly totals = computed(() =>
    this.portions().reduce(
      (sum, p) => {
        const foodItem = this.foods().find((f) => f.id === p.foodId);
        if (!foodItem) return sum;

        const factor =
          foodItem.baseNutritionnelle === '100g' || foodItem.baseNutritionnelle === '100ml'
            ? p.quantity / 100
            : p.quantity;

        const kcal = foodItem.kcal ?? foodItem.caloriesPar100g ?? 0;
        const protein = foodItem.proteinesG ?? foodItem.proteinesG ?? 0;
        const carbs = foodItem.glucidesG ?? foodItem.glucidesG ?? 0;
        const fat = foodItem.lipidesG ?? foodItem.lipidesG ?? 0;

        return {
          kcal: sum.kcal + kcal * factor,
          protein: sum.protein + protein * factor,
          carbs: sum.carbs + carbs * factor,
          fat: sum.fat + fat * factor,
        };
      },
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    ),
  );

  private filtered(emplacement: 'stock' | 'courses'): Aliment[] {
    const query = this.search().trim().toLowerCase();
    const cat = this.selectedCategory();

    return this.foods()
      .filter((f) => {
        const matchEmplacement =
          emplacement === 'stock' ? f.quantiteStock > 0 : (f.quantiteAAcheter ?? 0) > 0;
        const macros: Record<Category, number> = {
          Protéines: f.proteinesG ?? 0,
          Glucides: f.glucidesG ?? 0,
          Lipides: f.lipidesG ?? 0,
        };
        const matchCat =
          !cat || (macros[cat] > 0 && macros[cat] === Math.max(...Object.values(macros)));
        const nameToSearch = (f.name || f.nom || '').toLowerCase();
        const matchSearch = !query || nameToSearch.includes(query);

        return matchEmplacement && matchCat && matchSearch;
      })
      .map((f) => ({
        ...f,
        quantity: emplacement === 'stock' ? f.quantiteStock : (f.quantiteAAcheter ?? 0),
      }));
  }

  food(id: string): Aliment | undefined {
    return this.foods().find((f) => f.id === id);
  }

  portion(id: string): number {
    return this.portions().find((p) => p.foodId === id)?.quantity ?? 0;
  }

  setCategory(category: Category | null): void {
    this.selectedCategory.set(category);
  }

  updateQuantity(id: string, value: number, emplacement: 'stock' | 'courses' = 'stock'): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.alimentationService
      .updateAlimentQuantity(id, value, emplacement)
      .subscribe({ error: () => this.loadError.set('Impossible de modifier la quantité.') });
  }

  moveToStock(id: string): void {
    this.alimentationService
      .moveToStock(id)
      .subscribe({ error: () => this.loadError.set('Impossible de transférer cet aliment.') });
  }

  setPortion(id: string, value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.selectedRecipe.set(null);
    this.portions.update((items) =>
      value === 0
        ? items.filter((p) => p.foodId !== id)
        : items.some((p) => p.foodId === id)
          ? items.map((p) => (p.foodId === id ? { ...p, quantity: value } : p))
          : [...items, { foodId: id, quantity: value }],
    );
  }

  toggleFood(foodItem: Aliment): void {
    const currentPortion = this.portion(foodItem.id);
    const unit = foodItem.unit || foodItem.unite;
    const defaultQty = unit === 'unité(s)' ? 1 : 100;

    this.setPortion(foodItem.id, currentPortion ? 0 : defaultQty);
  }

  chooseRecipe(recipe: RepasResponseDTO): void {
    this.selectedRecipe.set(recipe);
    if (recipe.ingredients) {
      this.portions.set(
        recipe.ingredients.map((i) => ({
          foodId: i.alimentId,
          quantity: i.quantite,
        })),
      );
    }
  }

  addMissingToShopping(): void {
    for (const entry of this.missing()) {
      this.updateQuantity(
        entry.food.id,
        Math.max(entry.food.quantiteAAcheter ?? 0, entry.quantity),
        'courses',
      );
    }
  }

  openTaskDialog(): void {
    /* Dialogue global */
  }

  round(value: number): number {
    return Math.round(value || 0);
  }
}

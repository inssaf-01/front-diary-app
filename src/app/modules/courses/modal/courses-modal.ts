import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export type ActionCourses = 'aliment' | 'repas' | 'ajout-repas' | 'stock';
export type BaseNutritionnelle = 'POUR_100_G' | 'PAR_UNITE';
export interface Aliment {
  id: string;
  nom: string;
  unite: string;
  quantiteStock: number;
  quantiteAAcheter: number;
  calories?: number | null;
  proteinesG?: number | null;
  glucidesG?: number | null;
  lipidesG?: number | null;
  fibresG?: number | null;
  baseNutritionnelle?: BaseNutritionnelle | null;
}
export interface IngredientRepas { alimentId: string; quantite: number }
export interface Repas { id: string; nom: string; aliments?: IngredientRepas[] }

export interface AlimentPayload {
  nom: string; description: string | null; unite: string;
  quantiteStock: number; quantiteAAcheter: number;
  calories: number | null; proteinesG: number | null;
  glucidesG: number | null; lipidesG: number | null; fibresG: number | null;
  baseNutritionnelle: BaseNutritionnelle | null;
}
export interface RepasPayload {
  nom: string; description: string | null; typeRepas: string | null;
  aliments: IngredientRepas[];
}

@Component({
  selector: 'app-courses-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './courses-modal.html',
  styleUrl: './courses-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoursesModalComponent {
  @Input() visible = false;
  @Input() aliments: Aliment[] = [];
  @Input() repas: Repas[] = [];
  @Input() enregistrement = false;
  @Output() ferme = new EventEmitter<void>();
  @Output() creerAliment = new EventEmitter<AlimentPayload>();
  @Output() creerRepas = new EventEmitter<RepasPayload>();
  @Output() ajouterAuRepas = new EventEmitter<{ repasId: string; alimentId: string; quantite: number }>();
  @Output() modifierStock = new EventEmitter<{ alimentId: string; quantiteStock: number; quantiteAAcheter: number }>();

  action: ActionCourses = 'repas';
  erreur = '';
  succes = '';
  recherche = '';
  nutritionOuverte = false;
  nutritionActive = false;
  aliment: AlimentPayload = this.alimentVide();
  repasForm = { nom: '', description: '', typeRepas: '' };
  composition: IngredientRepas[] = [];
  repasId = '';
  alimentId = '';
  quantite: number | null = null;
  stockAlimentId = '';
  stockActuel: number | null = null;
  achatActuel: number | null = null;

  get resultats(): Aliment[] {
    const q = this.recherche.trim().toLocaleLowerCase('fr');
    return this.aliments.filter(a => a.nom.toLocaleLowerCase('fr').includes(q)).slice(0, 8);
  }
  get alimentSelectionne(): Aliment | undefined { return this.aliments.find(a => a.id === this.alimentId); }
  get stockSelectionne(): Aliment | undefined { return this.aliments.find(a => a.id === this.stockAlimentId); }
  get repasSelectionne(): Repas | undefined { return this.repas.find(r => r.id === this.repasId); }
  get dejaPresent(): boolean {
    return !!this.alimentId && !!this.repasSelectionne?.aliments?.some(i => i.alimentId === this.alimentId);
  }
  alimentParId(id: string): Aliment | undefined { return this.aliments.find(a => a.id === id); }
  dansComposition(id: string): boolean { return this.composition.some(i => i.alimentId === id); }

  choisirAction(action: ActionCourses): void {
    this.action = action; this.erreur = ''; this.succes = ''; this.recherche = '';
  }
  fermer(): void { this.ferme.emit(); }
  /** À appeler après confirmation de succès de la requête API par le parent. */
  confirmerSucces(message = 'Enregistré avec succès'): void {
    this.succes = message; this.erreur = ''; this.recherche = '';
    this.aliment = this.alimentVide();
    this.repasForm = { nom: '', description: '', typeRepas: '' };
    this.composition = []; this.quantite = null; this.alimentId = '';
  }
  signalerErreur(message: string): void { this.erreur = message; this.succes = ''; }

  ajouterIngredient(a: Aliment): void {
    if (this.dansComposition(a.id)) { this.erreur = 'Cet aliment est déjà dans la composition.'; return; }
    this.composition = [...this.composition, { alimentId: a.id, quantite: 1 }];
    this.recherche = ''; this.erreur = '';
  }
  retirerIngredient(id: string): void { this.composition = this.composition.filter(i => i.alimentId !== id); }
  modifierQuantiteIngredient(id: string, value: number | null): void {
    this.composition = this.composition.map(i => i.alimentId === id ? { ...i, quantite: Number(value) } : i);
  }

  /** Retourne null si une valeur manque ou si l'unité ne correspond pas à la base. */
  total(champ: 'calories' | 'proteinesG' | 'glucidesG' | 'lipidesG' | 'fibresG'): number | null {
    if (!this.composition.length) return null;
    let somme = 0;
    for (const i of this.composition) {
      const a = this.alimentParId(i.alimentId);
      if (!a || a[champ] == null || !Number.isFinite(i.quantite) || i.quantite <= 0) return null;
      const facteur = a.baseNutritionnelle === 'POUR_100_G' && a.unite.toLowerCase() === 'g'
        ? i.quantite / 100
        : a.baseNutritionnelle === 'PAR_UNITE' && ['pièce', 'piece', 'unité', 'unite'].includes(a.unite.toLowerCase())
          ? i.quantite : null;
      if (facteur == null) return null;
      somme += Number(a[champ]) * facteur;
    }
    return Math.round(somme * 10) / 10;
  }

  selectionnerStock(id: string): void {
    this.stockAlimentId = id;
    const a = this.stockSelectionne;
    this.stockActuel = a?.quantiteStock ?? null;
    this.achatActuel = a?.quantiteAAcheter ?? null;
    this.erreur = '';
  }

  validerAliment(): void {
    const a = this.aliment;
    if (!a.nom.trim() || !a.unite.trim() || !this.estQuantite(a.quantiteStock) || !this.estQuantite(a.quantiteAAcheter)) {
      this.erreur = 'Renseignez le nom, l’unité et des quantités positives ou nulles.'; return;
    }
    const valeurs = [a.calories, a.proteinesG, a.glucidesG, a.lipidesG, a.fibresG];
    if (this.nutritionActive && (!a.baseNutritionnelle || valeurs.some(v => v !== null && !this.estQuantite(v)))) {
      this.erreur = 'Choisissez une base nutritionnelle et vérifiez les valeurs saisies.'; return;
    }
    this.erreur = '';
    this.creerAliment.emit({ ...a, nom: a.nom.trim(), unite: a.unite.trim(), description: a.description?.trim() || null,
      ...(this.nutritionActive ? {} : { calories: null, proteinesG: null, glucidesG: null, lipidesG: null, fibresG: null, baseNutritionnelle: null }) });
  }
  validerRepas(): void {
    if (!this.repasForm.nom.trim() || !this.composition.length || this.composition.some(i => !this.estQuantite(i.quantite) || i.quantite === 0)) {
      this.erreur = 'Indiquez le nom du repas et au moins un aliment avec une quantité supérieure à zéro.'; return;
    }
    this.erreur = '';
    this.creerRepas.emit({ nom: this.repasForm.nom.trim(), description: this.repasForm.description.trim() || null,
      typeRepas: this.repasForm.typeRepas.trim() || null, aliments: this.composition.map(i => ({ ...i })) });
  }
  validerAjout(): void {
    if (!this.repasId || !this.alimentId || !this.estQuantite(this.quantite) || this.quantite === 0 || this.dejaPresent) {
      this.erreur = this.dejaPresent ? 'Cet aliment est déjà présent dans ce repas. Modifiez sa quantité dans le repas.' : 'Choisissez un repas, un aliment et une quantité supérieure à zéro.'; return;
    }
    this.erreur = '';
    this.ajouterAuRepas.emit({ repasId: this.repasId, alimentId: this.alimentId, quantite: Number(this.quantite) });
  }
  validerStock(): void {
    if (!this.stockAlimentId || !this.estQuantite(this.stockActuel) || !this.estQuantite(this.achatActuel)) {
      this.erreur = 'Choisissez un aliment et renseignez deux quantités positives ou nulles.'; return;
    }
    this.erreur = '';
    this.modifierStock.emit({ alimentId: this.stockAlimentId, quantiteStock: Number(this.stockActuel), quantiteAAcheter: Number(this.achatActuel) });
  }
  private estQuantite(v: number | null): boolean { return v !== null && Number.isFinite(Number(v)) && Number(v) >= 0; }
  private alimentVide(): AlimentPayload {
    return { nom: '', description: null, unite: 'g', quantiteStock: 0, quantiteAAcheter: 0,
      calories: null, proteinesG: null, glucidesG: null, lipidesG: null, fibresG: null, baseNutritionnelle: null };
  }
}

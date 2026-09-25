export interface Aliment {
  id: string;
  nom: string;
  description?: string;
  unite: string;
  quantiteStock: number;
  quantiteAAcheter?: number;
  calories?: number;
  baseNutritionnelle?: string;
  categorie?: string;
  emplacement: 'stock' | 'courses';
  caloriesPar100g?: number;
  proteinesG?: number;
  glucidesG?: number;
  lipidesG?: number;
  fibresG?: number;

  // Propriétés de présentations UI (calculées dynamiquement dans le service)
  icon?: string;
  name?: string;
  quantity?: number;
  unit?: string;
  kcal?: number;
  categories?: string[];
}

export interface RepasResponseDTO {
  id?: string;
  name: string;
  description?: string;
  icon?: string;
  ingredients?: Array<{
    alimentId: string;
    quantite: number;
  }>;
}

export interface AlimentRepasDTO {
  alimentId: string;
  nom: string;
  unite: string;
  quantiteUtilisee: number;
  caloriesCalculated: number;
  proteinesGCalculated: number;
  glucidesGCalculated: number;
  lipidesGCalculated: number;
}

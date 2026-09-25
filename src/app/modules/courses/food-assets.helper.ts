export interface FoodAsset {
  keywords: string[];
  icon: string;
}

/**
 * Catalogue d'icônes par mots-clés d'aliments
 */
export const FOOD_ICONS_MAPPING: FoodAsset[] = [
  // Protéines
  { keywords: ['oeuf', 'œuf', 'egg'], icon: '🥚' },
  { keywords: ['saumon', 'salmon', 'poisson', 'fish'], icon: '🐟' },
  { keywords: ['poulet', 'chicken', 'volaille'], icon: '🍗' },
  { keywords: ['viande', 'steak', 'bœuf', 'boeuf'], icon: '🥩' },
  { keywords: ['crevette', 'shrimp'], icon: '🦐' },
  { keywords: ['lentille', 'lentil', 'haricot'], icon: '🫘' },
  { keywords: ['skyr', 'yaourt', 'yoghurt', 'fromage'], icon: '🥣' },
  { keywords: ['whey', 'proteine', 'protéine'], icon: '🥤' },

  // Glucides / Féculents
  { keywords: ['riz', 'rice'], icon: '🍚' },
  { keywords: ['pain', 'bread', 'toast'], icon: '🍞' },
  { keywords: ['pâte', 'pate', 'pasta', 'spaghetti'], icon: '🍝' },
  { keywords: ['avoine', 'oat', 'porridge', 'muesli'], icon: '🥣' },
  { keywords: ['patate', 'pomme de terre', 'potato'], icon: '🥔' },

  // Fruits & Légumes
  { keywords: ['tomate', 'tomato'], icon: '🍅' },
  { keywords: ['epinard', 'épinard', 'spinach', 'salade'], icon: '🥬' },
  { keywords: ['avocat', 'avocado'], icon: '🥑' },
  { keywords: ['banane', 'banana'], icon: '🍌' },
  { keywords: ['pomme', 'apple'], icon: '🍎' },
  { keywords: ['brocoli', 'broccoli'], icon: '🥦' },
  { keywords: ['carotte', 'carrot'], icon: '🥕' },
  { keywords: ['citron', 'lemon'], icon: '🍋' },
  { keywords: ['champignon', 'mushroom'], icon: '🍄' },

  // Lipides / Matières grasses
  { keywords: ['huile', 'oil', 'olive'], icon: '🫒' },
  { keywords: ['beurre', 'butter'], icon: '🧈' },
  { keywords: ['cacahuete', 'cacahuète', 'peanut', 'amande', 'noix'], icon: '🥜' },

  // Boissons & Divers
  { keywords: ['eau', 'water'], icon: '💧' },
  { keywords: ['café', 'cafe', 'coffee'], icon: '☕' },
  { keywords: ['thé', 'the', 'tea'], icon: '🍵' },
  { keywords: ['lait', 'milk'], icon: '🥛' },
  { keywords: ['miel', 'honey'], icon: '🍯' },
  { keywords: ['chocolat', 'chocolate'], icon: '🍫' },
];

/**
 * Icônes par défaut selon la catégorie si aucun nom ne correspond
 */
export const CATEGORY_ICONS: Record<string, string> = {
  Protéines: '🥩',
  Glucides: '🍚',
  Lipides: '🫒',
  'Fruits & légumes': '🥗',
  Boissons: '🥤',
};

/**
 * Détermine la meilleure icône emoji pour un aliment donné
 */
export function getFoodIcon(nom: string, categorie?: string): string {
  if (!nom) return '📦';

  const normaliser = (value: string): string =>
    value
      .toLocaleLowerCase('fr')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const cleanNom = normaliser(nom);

  // 1. Recherche par mot-clé dans le nom
  const found = FOOD_ICONS_MAPPING.find((asset) =>
    asset.keywords.some((kw) => cleanNom.includes(normaliser(kw))),
  );

  if (found) {
    return found.icon;
  }

  // 2. Repli sur la catégorie
  if (categorie) {
    const category = Object.keys(CATEGORY_ICONS).find(
      (key) => normaliser(key) === normaliser(categorie),
    );
    if (category) return CATEGORY_ICONS[category];
  }

  // 3. Icône générique par défaut
  return '📦';
}

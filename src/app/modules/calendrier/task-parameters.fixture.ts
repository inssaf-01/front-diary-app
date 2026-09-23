import { TaskParameters } from './task-parameters.service';

// Test data only, never imported by the application.
export const taskParameters: TaskParameters = {
  typesTache: [
    { id: 1, categorie: 'TYPE_TACHE', code: 'TACHE', libelle: 'Tâche personnalisée', ordre: 1 },
    {
      id: 10,
      categorie: 'TYPE_TACHE',
      code: 'REUNION',
      libelle: 'Réunion personnalisée',
      ordre: 2,
    },
    { id: 3, categorie: 'TYPE_TACHE', code: 'COURSES', libelle: 'Courses', ordre: 3 },
  ],
  statuts: ['A_FAIRE', 'EN_COURS', 'TERMINEE', 'ANNULEE'].map((code, i) => ({
    id: 19 + i,
    categorie: 'STATUT_TACHE',
    code,
    libelle: 'Libellé ' + code,
    ordre: i,
  })),
  priorites: [
    {
      id: 30,
      categorie: 'PRIORITE_TACHE',
      code: 'URGENTE',
      libelle: 'Priorité personnalisée',
      ordre: 1,
    },
    { id: 31, categorie: 'PRIORITE_TACHE', code: 'NORMALE', libelle: 'Normale', ordre: 2 },
    { id: 32, categorie: 'PRIORITE_TACHE', code: 'HAUTE', libelle: 'Haute', ordre: 3 },
    { id: 33, categorie: 'PRIORITE_TACHE', code: 'BASSE', libelle: 'Basse', ordre: 4 },
  ],
};

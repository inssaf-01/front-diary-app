import { HttpContextToken } from '@angular/common/http';

// Une édition en cours doit pouvoir afficher l'erreur sans perdre son état local.
export const KEEP_PENDING_EDITS = new HttpContextToken<boolean>(() => false);

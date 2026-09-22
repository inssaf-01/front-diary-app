import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { API_CONFIG } from '../../core/config/api.config';
import { LoginPayload } from './login';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  roleId: number;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthenticatedUser;
}

@Injectable({
  providedIn: 'root',
})
export class LoginService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  login(payload: LoginPayload): Observable<AuthResponse> {
    console.log('========== [AUTH] login START ==========');
    console.log('[AUTH] rememberMe =', payload.rememberMe);

    return this.http.post<AuthResponse>(`${API_CONFIG.baseUrl}/auth/login`, payload).pipe(
      tap((response) => {
        console.log('========== [AUTH] login RESPONSE ==========');

        console.log('[AUTH] accessToken reçu =', response.accessToken ? 'OUI' : 'NON');

        console.log('[AUTH] user =', response.user);
        console.log('[AUTH] expiresIn =', response.expiresIn);

        if (!isPlatformBrowser(this.platformId)) {
          console.error('[AUTH] ERREUR : isPlatformBrowser = FALSE');
          return;
        }

        this.clearAuthentication();

        const storage = payload.rememberMe ? localStorage : sessionStorage;

        console.log(
          '[AUTH] storage choisi =',
          payload.rememberMe ? 'localStorage' : 'sessionStorage',
        );

        storage.setItem('accessToken', response.accessToken);
        storage.setItem('currentUser', JSON.stringify(response.user));
        storage.setItem('tokenExpiresAt', String(Date.now() + response.expiresIn * 1000));

        console.log(
          '[AUTH] après setItem accessToken =',
          storage.getItem('accessToken') ? 'PRÉSENT' : 'ABSENT',
        );

        console.log(
          '[AUTH] sessionStorage =',
          sessionStorage.getItem('accessToken') ? 'PRÉSENT' : 'ABSENT',
        );

        console.log(
          '[AUTH] localStorage =',
          localStorage.getItem('accessToken') ? 'PRÉSENT' : 'ABSENT',
        );

        console.log(
          '[AUTH] getAccessToken() immédiatement =',
          this.getAccessToken() ? 'PRÉSENT' : 'ABSENT',
        );

        console.log('========== [AUTH] login STORAGE END ==========');
      }),
    );
  }

  getAccessToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;

    const sessionToken = sessionStorage.getItem('accessToken');
    const localToken = localStorage.getItem('accessToken');

    const storage = sessionToken ? sessionStorage : localStorage;
    const token = sessionToken ?? localToken;

    if (!token) return null;

    const expiresAt = this.getTokenExpiry(token);

    if (expiresAt !== null && expiresAt <= Date.now()) {
      this.clearAuthentication();
      return null;
    }

    return token;
  }
  private getTokenExpiry(token: string): number | null {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload)) as { exp?: number };

      return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
    } catch {
      return null;
    }
  }
  getCurrentUser(): AuthenticatedUser | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    const value = sessionStorage.getItem('currentUser') ?? localStorage.getItem('currentUser');

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as AuthenticatedUser;
    } catch {
      this.clearAuthentication();
      return null;
    }
  }

  logout(): void {
    this.clearAuthentication();
  }

  private clearAuthentication(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('tokenExpiresAt');

    localStorage.removeItem('accessToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('tokenExpiresAt');
  }
}

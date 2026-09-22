import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { API_CONFIG } from '../../../core/config/api.config';
import { LoginPayload } from '../login';

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
    return this.http.post<AuthResponse>(`${API_CONFIG.baseUrl}/auth/login`, payload).pipe(
      tap((response) => {
        if (!isPlatformBrowser(this.platformId)) return;
        this.clearAuthentication();

        const storage = payload.rememberMe ? localStorage : sessionStorage;

        storage.setItem('accessToken', response.accessToken);

        storage.setItem('currentUser', JSON.stringify(response.user));

        storage.setItem('tokenExpiresAt', String(Date.now() + response.expiresIn * 1000));
      }),
    );
  }

  getAccessToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    const storage = sessionStorage.getItem('accessToken') ? sessionStorage : localStorage;
    const token = storage.getItem('accessToken');
    if (!token) return null;

    const expiresAt = Number(storage.getItem('tokenExpiresAt'));
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      this.clearAuthentication();
      return null;
    }
    return token;
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

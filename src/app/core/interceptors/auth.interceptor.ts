import { inject } from '@angular/core';
import { LoginService } from '../../modules/test-connexion/login.service';
import { API_CONFIG } from '../config/api.config';
import { HttpInterceptorFn } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { KEEP_PENDING_EDITS } from './auth.context';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const loginService = inject(LoginService);
  const router = inject(Router);
  const isProtectedApi =
    request.url.startsWith(`${API_CONFIG.baseUrl}/`) &&
    !request.url.startsWith(`${API_CONFIG.baseUrl}/auth/`);

  if (!isProtectedApi) {
    return next(request);
  }

  const token = loginService.getAccessToken();
  const authenticatedRequest = token
    ? request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      })
    : request;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      const currentToken = loginService.getAccessToken();
      if (
        !request.context.get(KEEP_PENDING_EDITS) &&
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        token &&
        (!currentToken || currentToken === token)
      ) {
        loginService.logout();
        void router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};

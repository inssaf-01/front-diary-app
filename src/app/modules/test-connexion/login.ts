import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';

import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Router } from '@angular/router';

import { AppButtonComponent } from '../../shared/ui-components/app-button/app-button';

import { AppInputTextComponent } from '../../shared/ui-components/app-input-text/app-input-text';

import { LoginService } from './login.service';
import { finalize } from 'rxjs';

export interface LoginPayload {
  identifier: string;
  password: string;
  rememberMe: boolean;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, AppButtonComponent, AppInputTextComponent],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly loginService = inject(LoginService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  loading = false;
  authenticationError = '';
  showPassword = false;

  readonly loginForm = this.formBuilder.nonNullable.group({
    identifier: ['', [Validators.required]],

    password: ['', [Validators.required, Validators.minLength(6)]],

    rememberMe: [false],
  });

  get identifierInvalid(): boolean {
    const control = this.loginForm.controls.identifier;

    return control.invalid && (control.dirty || control.touched);
  }

  get passwordInvalid(): boolean {
    const control = this.loginForm.controls.password;

    return control.invalid && (control.dirty || control.touched);
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  submit(): void {
    if (this.loginForm.invalid || this.loading) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.authenticationError = '';
    this.cdr.markForCheck();

    const payload: LoginPayload = this.loginForm.getRawValue();

    this.loginService
      .login(payload)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (response) => {
          console.log('========== [LOGIN COMPONENT] SUCCESS ==========');

          console.log('[LOGIN COMPONENT] accessToken reçu :', response.accessToken ? 'OUI' : 'NON');

          console.log(
            '[LOGIN COMPONENT] sessionStorage token :',
            sessionStorage.getItem('accessToken') ? 'PRÉSENT' : 'ABSENT',
          );

          console.log(
            '[LOGIN COMPONENT] localStorage token :',
            localStorage.getItem('accessToken') ? 'PRÉSENT' : 'ABSENT',
          );

          console.log(
            '[LOGIN COMPONENT] currentUser session :',
            sessionStorage.getItem('currentUser'),
          );

          console.log('[LOGIN COMPONENT] currentUser local :', localStorage.getItem('currentUser'));

          console.log('========== [LOGIN COMPONENT] NAVIGATE ==========');

          void this.router.navigate(['/home']);
        },

        error: (error) => {
          console.error('Erreur de connexion :', error);

          if (error.status === 401) {
            this.authenticationError = 'Identifiant ou mot de passe incorrect.';
          } else if (error.status === 0) {
            this.authenticationError = 'Impossible de joindre le serveur.';
          } else {
            this.authenticationError = 'Une erreur est survenue. Veuillez réessayer.';
          }

          this.cdr.markForCheck();
        },
      });
  }

  requestPasswordReset(event: Event): void {
    event.preventDefault();

    // À remplacer plus tard par la route réelle.
    this.router.navigate(['/forgot-password']);
  }
}

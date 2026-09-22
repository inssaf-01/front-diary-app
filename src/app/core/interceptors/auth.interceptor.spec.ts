import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { LoginService } from '../../modules/test-connexion/login.service';
import { API_CONFIG } from '../config/api.config';
import { authInterceptor } from './auth.interceptor';

describe('Calendar authentication', () => {
  let http: HttpClient;
  let requests: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    requests = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    requests.verify();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('sends the stored session token to the parameters API', () => {
    sessionStorage.setItem('accessToken', 'test-token');
    sessionStorage.setItem('tokenExpiresAt', String(Date.now() + 60000));
    http.get(`${API_CONFIG.baseUrl}/parametres`).subscribe();
    const req = requests.expectOne(`${API_CONFIG.baseUrl}/parametres`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush([]);
  });

  it('clears an expired session', () => {
    localStorage.setItem('accessToken', 'expired-token');
    localStorage.setItem('tokenExpiresAt', String(Date.now() - 1000));
    expect(TestBed.inject(LoginService).getAccessToken()).toBeNull();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('returns to login when the API refuses the session', () => {
    sessionStorage.setItem('accessToken', 'rejected-token');
    sessionStorage.setItem('tokenExpiresAt', String(Date.now() + 60000));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    http.get(`${API_CONFIG.baseUrl}/parametres`).subscribe({ error: () => {} });
    requests
      .expectOne(`${API_CONFIG.baseUrl}/parametres`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});

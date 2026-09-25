import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AlimentationService } from './alimentation.service';
import { LoginService } from '../test-connexion/login.service';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { API_CONFIG } from '../../core/config/api.config';
describe('Alimentation authenticated loading', () => {
  const logout = vi.fn();
  let requests: HttpTestingController;
  beforeEach(() => {
    logout.mockReset();
    TestBed.configureTestingModule({providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      {provide: LoginService, useValue: {getAccessToken: () => 'test-token', logout}}]});
    requests = TestBed.inject(HttpTestingController);
  });
  afterEach(() => requests.verify());
  it('uses the authenticated endpoint and maps food data', () => {
    const service = TestBed.inject(AlimentationService);
    service.loadDashboard();
    const req = requests.expectOne(API_CONFIG.baseUrl + '/alimentation/dashboard');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush({tousLesAliments: [{id: 'food', nom: 'Pomme', unite: 'g', quantiteStock: 100, quantiteAAcheter: 2, calories: 52}], alimentsEnStock: [], alimentsAAcheter: [], repas: [{id: 'meal', nom: 'Salade', ingredients: [{alimentId: 'food', quantite: 50}]}]});
    expect(service.recipes()[0].name).toBe('Salade');
    expect(service.recipes()[0].ingredients![0].alimentId).toBe('food');
    expect(service.foods()[0].quantiteAAcheter).toBe(2);
    expect(service.foods()[0].name).toBe('Pomme');
    expect(service.foods()[0].kcal).toBe(52);
    expect(service.isLoading()).toBe(false);
  });
  it('shows a recoverable server error without logging out', () => {
    const service = TestBed.inject(AlimentationService);
    service.loadDashboard();
    requests.expectOne(API_CONFIG.baseUrl + '/alimentation/dashboard').flush(null, {status: 500, statusText: 'Server error'});
    expect(logout).not.toHaveBeenCalled();
    expect(service.loadError()).not.toBe('');
    expect(service.isLoading()).toBe(false);
  });
});

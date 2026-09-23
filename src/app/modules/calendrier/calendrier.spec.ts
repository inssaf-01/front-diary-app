import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CalendrierComponent } from './calendrier';
import { LoginService } from '../test-connexion/login.service';
import { TacheResponse } from '../home/home-calendar.service';
import { taskParameters } from './task-parameters.fixture';

describe('Backend calendar', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CalendrierComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: LoginService,
          useValue: {
            getCurrentUser: () => ({ username: 'Samira', email: 'samira@example.test' }),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function start() {
    const fixture = TestBed.createComponent(CalendrierComponent);
    fixture.componentInstance.dateSelectionnee = new Date(2026, 8, 23);
    fixture.componentInstance.moisAffiche = new Date(2026, 8, 1);
    fixture.detectChanges();
    http
      .expectOne((req) => req.url.endsWith('/parametres'))
      .flush([
        ...taskParameters.typesTache,
        ...taskParameters.statuts,
        ...taskParameters.priorites,
      ]);
    return fixture;
  }
  const task = (
    id: string,
    start = '2026-09-23T14:00:00',
    end: string | null = '2026-09-23T15:00:00',
  ): TacheResponse => ({
    id,
    titre: id,
    details: 'Détails API',
    typeTacheId: 10,
    statutId: 19,
    prioriteId: 30,
    dateDebut: new Date(start).toISOString(),
    dateFin: end ? new Date(end).toISOString() : null,
    touteLaJournee: false,
    createdAt: '',
    updatedAt: '',
  });
  it('loads the visible 42 days with all statuses and derives labels and user from API data', async () => {
    const fixture = start();
    const request = http.expectOne((req) => req.url.endsWith('/calendrier'));
    expect(request.request.params.get('dateDebut')).toBe(new Date(2026, 7, 31).toISOString());
    expect(request.request.params.get('dateFin')).toBe(new Date(2026, 9, 12).toISOString());
    expect(request.request.params.get('vueComplete')).toBe('true');
    request.flush([task('14h'), task('10h', '2026-09-23T10:00:00', '2026-09-23T11:00:00')]);
    await fixture.whenStable();
    expect(fixture.componentInstance.tachesDuJour.map((t) => t.id)).toEqual(['10h', '14h']);
    expect(fixture.nativeElement.textContent).toContain('Samira');
    expect(fixture.nativeElement.textContent).toContain('Réunion personnalisée');
    expect(fixture.nativeElement.textContent).not.toContain('Chargement des tâches');
  });
  it('cancels stale requests on rapid navigation and reuses references', async () => {
    const fixture = start();
    const initial = http.expectOne((req) => req.url.endsWith('/calendrier'));
    fixture.componentInstance.changerMois(1);
    expect(initial.cancelled).toBe(true);
    const october = http.expectOne((req) => req.url.endsWith('/calendrier'));
    fixture.componentInstance.changerMois(1);
    expect(october.cancelled).toBe(true);
    http.expectOne((req) => req.url.endsWith('/calendrier')).flush([]);
    http.expectNone((req) => req.url.endsWith('/parametres'));
    await fixture.whenStable();
    expect(fixture.componentInstance.loading).toBe(false);
    expect(fixture.componentInstance.dateSelectionnee.getMonth()).toBe(10);
  });

  it('renders delayed responses after consecutive month changes without another click', async () => {
    const fixture = start();
    http.expectOne(req => req.url.endsWith('/calendrier')).flush([]);
    await fixture.whenStable();

    for (const month of [10, 11]) {
      fixture.nativeElement.querySelector('[aria-label="Mois suivant"]').click();
      await fixture.whenStable();
      expect(fixture.nativeElement.textContent).toContain('Chargement des tâches');
      const request = http.expectOne(req => req.url.endsWith('/calendrier'));
      const label = 'Rendez-vous du mois ' + month;
      await new Promise<void>(resolve => setTimeout(() => {
        request.flush([task(label, `2026-${month}-01T14:00:00`, `2026-${month}-01T15:00:00`)]);
        resolve();
      }, 0));
      // No detectChanges or user event after the API response.
      await fixture.whenStable();
      expect(fixture.nativeElement.textContent).not.toContain('Chargement des tâches');
      expect(fixture.nativeElement.querySelector('.task-list').textContent).toContain(label);
      expect(fixture.nativeElement.querySelector('.timeline-events').textContent).toContain(label);
    }
  });
  it('includes overnight and all-day tasks, excludes a midnight end, and separates overlaps', async () => {
    const fixture = start();
    http
      .expectOne((req) => req.url.endsWith('/calendrier'))
      .flush([
        task('night', '2026-09-22T23:00:00', '2026-09-23T02:00:00'),
        task('overlap', '2026-09-23T01:00:00', '2026-09-23T03:00:00'),
        task('midnight-end', '2026-09-22T22:00:00', '2026-09-23T00:00:00'),
        { ...task('all-day', '2026-09-22T00:00:00', '2026-09-23T00:00:00'), touteLaJournee: true },
        { ...task('done'), statutId: 21 },
      ]);
    await fixture.whenStable();
    const c = fixture.componentInstance;
    expect(c.tachesDuJour.map((t) => t.id)).toEqual(['all-day', 'night', 'overlap', 'done']);
    expect(c.evenementsHoraires.slice(0, 2).map((t) => t.width)).toEqual([50, 50]);
    expect(c.evenementsHoraires[0].top).toBe(0);
    c.filtreStatut = 21;
    expect(c.tachesDuJour.map((t) => t.id)).toEqual(['done']);
    c.resetFilters();
    c.recherche = 'night';
    expect(c.tachesDuJour.map((t) => t.id)).toEqual(['night']);
  });
  it('adds on the selected date and refreshes only after the POST succeeds', async () => {
    const fixture = start();
    http.expectOne((req) => req.url.endsWith('/calendrier')).flush([]);
    await fixture.whenStable();
    fixture.nativeElement.querySelector('.add-button').click();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('#task-title') as HTMLInputElement;
    expect(fixture.nativeElement.querySelector('#start-date').value).toBe('2026-09-23');
    input.value = 'Nouvelle tâche';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.nativeElement.querySelector('.button--primary').click();
    const post = http.expectOne((req) => req.method === 'POST');
    expect(post.request.body.typeTacheId).toBe(1);
    expect(post.request.body.dateDebut).toBe(new Date('2026-09-23T09:00:00').toISOString());
    post.flush(task('new'));
    http.expectOne((req) => req.url.endsWith('/calendrier')).flush([task('new')]);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.task-overlay')).toBeNull();
    expect(fixture.componentInstance.nombreTachesDuJour).toBe(1);
  });
  it('persists status IDs and keeps the previous selection on failure', async () => {
    const fixture = start();
    http.expectOne((req) => req.url.endsWith('/calendrier')).flush([task('meeting')]);
    await fixture.whenStable();
    const select = fixture.nativeElement.querySelector(
      '.task-controls select',
    ) as HTMLSelectElement;
    select.value = '21';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const patch = http.expectOne((req) => req.method === 'PATCH');
    expect(patch.request.body).toEqual({ modifications: [{ tacheId: 'meeting', statutId: 21 }] });
    patch.flush(null, { status: 500, statusText: 'Error' });
    expect(select.value).toBe('19');
    expect(fixture.componentInstance.savingStatuses.size).toBe(0);
    fixture.componentInstance.changerStatut(fixture.componentInstance.taches[0], 21);
    http.expectOne((req) => req.method === 'PATCH').flush([{ ...task('meeting'), statutId: 21 }]);
    await fixture.whenStable();
    expect(fixture.componentInstance.taches[0].statutId).toBe(21);
  });
  it('exits loading on error and allows retry', async () => {
    const fixture = start();
    http
      .expectOne((req) => req.url.endsWith('/calendrier'))
      .flush(null, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(fixture.componentInstance.loading).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Impossible de charger');
    fixture.componentInstance.refresh();
    http.expectOne((req) => req.url.endsWith('/calendrier')).flush([]);
    await fixture.whenStable();
    expect(fixture.componentInstance.error).toBe('');
  });
});

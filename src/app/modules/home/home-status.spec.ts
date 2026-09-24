import { taskParameters } from '../calendrier/task-parameters.fixture';
import { ChangeDetectorRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EMPTY, Subject } from 'rxjs';
import { HomeComponent } from './home';
import { HomeCalendarService, TacheResponse } from './home-calendar.service';
import { LoginService } from '../test-connexion/login.service';
import { API_CONFIG } from '../../core/config/api.config';

// Fixtures for isolated tests; application data still comes exclusively from the API.
const task = (code = 'A_FAIRE', id = 'task-1'): TacheResponse => ({
  id,
  titre: id,
  details: null,
  touteLaJournee: false,
  dateDebut: new Date().toISOString(),
  dateFin: null,
  createdAt: '',
  updatedAt: '',
  typeTacheId: 1,
  statutId: taskParameters.statuts.find((item) => item.code === code)?.id ?? -1,
  prioriteId: null,
});

describe('Home loading and status lifecycle (OnPush / zoneless)', () => {
  let requests: HttpTestingController;
  let service: HomeCalendarService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LoginService, useValue: { getCurrentUser: () => null } },
      ],
    });
    requests = TestBed.inject(HttpTestingController);
    service = TestBed.inject(HomeCalendarService);
  });

  afterEach(() => requests.verify());

  function page(tasks: TacheResponse[]) { return {content: tasks, totalElements: tasks.length}; }
  function flushParameters() {
    for (const request of requests.match((req) => req.url.endsWith('/parametres'))) {
      expect(request.request.params.has('categorie')).toBe(false);
      const all = [
        ...taskParameters.typesTache,
        ...taskParameters.statuts,
        ...taskParameters.priorites,
      ];
      request.flush(all);
    }
  }

  it('starts calendar requests at initialization without waiting for a render or click', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } },
        { provide: LoginService, useValue: { getCurrentUser: () => null } },
      ],
    });
    requests = TestBed.inject(HttpTestingController);
    const home = TestBed.runInInjectionContext(() => new HomeComponent());
    home.ngOnInit();
    flushParameters();
    requests.expectOne((req) => req.url.endsWith('/taches/accueil')).flush(page([task()]));
    expect(home.calendarLoading).toBe(false);
    expect(home.groups[0].events[0].id).toBe('task-1');
  });

  async function loaded(tasks = [task()]) {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    flushParameters();
    requests.expectOne((req) => req.url.endsWith('/taches/accueil')).flush(page(tasks));
    await fixture.whenStable();
    expect(fixture.componentInstance.calendarLoading).toBe(false);
    return fixture;
  }

  function select(fixture: Awaited<ReturnType<typeof loaded>>, code: string) {
    const element = fixture.nativeElement.querySelector('.status-select') as HTMLSelectElement;
    element.value = code;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('adds through the buttons while calendar loading fails, without losing the draft', async () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.add-button').click();
    await fixture.whenStable();
    const title = fixture.nativeElement.querySelector('#task-title') as HTMLInputElement;
    title.value = 'Draft before parameters';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    flushParameters();
    await fixture.whenStable();
    expect(title.value).toBe('Draft before parameters');
    expect(fixture.nativeElement.querySelector('.button--primary').disabled).toBe(false);
    requests
      .expectOne((req) => req.url.endsWith('/accueil'))
      .flush(null, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    fixture.nativeElement.querySelector('.button--primary').click();
    const post = requests.expectOne((req) => req.method === 'POST');
    expect(post.request.body).toMatchObject({
      titre: 'Draft before parameters',
      typeTacheId: 1,
      statutId: 19,
    });
    post.flush(task());
    requests.expectOne((req) => req.url.endsWith('/accueil')).flush(page([task()]));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.task-overlay')).toBeNull();
  });

  it('can open and submit after the initial calendar request failed', async () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    flushParameters();
    requests
      .expectOne((req) => req.url.endsWith('/accueil'))
      .flush(null, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    fixture.nativeElement.querySelector('.add-button').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.button--primary').disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Tâche personnalisée');
  });

  it('displays API labels and edits an existing task through PUT', async () => {
    const fixture = await loaded([{ ...task(), prioriteId: 30 }]);
    expect(fixture.nativeElement.textContent).toContain('Tâche personnalisée');
    expect(fixture.nativeElement.textContent).toContain('Priorité personnalisée');
    expect(fixture.nativeElement.textContent).toContain('Libellé A_FAIRE');
    fixture.nativeElement.querySelector('.task-edit').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Enregistrer les modifications');
    fixture.componentInstance.createTask({
      typeTacheId: 1,
      statutId: 20,
      prioriteId: null,
      titre: 'Modified',
      details: null,
      dateDebut: new Date().toISOString(),
      dateFin: null,
      touteLaJournee: false,
    });
    const put = requests.expectOne((req) => req.method === 'PUT');
    expect(put.request.url).toBe(`${API_CONFIG.baseUrl}/taches/task-1`);
    put.flush({ ...task('EN_COURS'), titre: 'Modified' });
    requests
      .expectOne((req) => req.url.endsWith('/accueil'))
      .flush(page([{ ...task('EN_COURS'), titre: 'Modified' }]));
    await fixture.whenStable();
    expect(fixture.componentInstance.taskDialogVisible).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Modified');
  });

  it.each(['success', 'empty', 'error'])(
    'renders calendar completion immediately without a click (%s)',
    async (outcome) => {
      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.nativeElement.textContent).toContain('Chargement de vos tâches');
      flushParameters();
      const calendar = requests.expectOne((req) => req.url.endsWith('/taches/accueil'));
      if (outcome === 'error') calendar.flush(null, { status: 500, statusText: 'Error' });
      else calendar.flush(page(outcome === 'empty' ? [] : [task()]));

      // Inspect the DOM directly: no click, detectChanges, or scheduled render after the response.
      expect(fixture.nativeElement.textContent).not.toContain('Chargement de vos tâches');
      if (outcome === 'success')
        expect(fixture.nativeElement.querySelector('.event-row')).not.toBeNull();
      if (outcome === 'empty')
        expect(fixture.nativeElement.textContent).toContain('Aucune tâche à afficher');
      if (outcome === 'error')
        expect(fixture.nativeElement.textContent).toContain('Impossible de charger vos tâches');
    },
  );

  it.each([true, false])(
    'creates through the API and unlocks the modal (success=%s)',
    async (success) => {
      const fixture = await loaded();
      const home = fixture.componentInstance;
      home.openTaskDialog();
      const payload = {
        typeTacheId: 10,
        statutId: 20,
        prioriteId: 30,
        titre: 'test ajout',
        details: 'test ajout tache',
        touteLaJournee: false,
        dateDebut: new Date('2026-09-23T12:45:00').toISOString(),
        dateFin: new Date('2026-09-23T19:30:00').toISOString(),
      };
      home.createTask(payload);
      home.createTask(payload);
      requests.expectNone((req) => req.url.endsWith('/parametres'));
      const post = requests.expectOne((req) => req.method === 'POST');
      expect(post.request.url).toBe(`${API_CONFIG.baseUrl}/taches`);
      expect(post.request.body).toEqual({
        typeTacheId: 10,
        statutId: 20,
        prioriteId: 30,
        titre: payload.titre,
        details: payload.details,
        touteLaJournee: false,
        dateDebut: new Date('2026-09-23T12:45:00').toISOString(),
        dateFin: new Date('2026-09-23T19:30:00').toISOString(),
      });
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.button--primary').disabled).toBe(true);
      if (success) {
        post.flush(task('EN_COURS'));
        flushParameters();
        requests
          .expectOne((req) => req.url.endsWith('/taches/accueil'))
          .flush(page([task('EN_COURS')]));
      } else {
        post.flush(null, { status: 500, statusText: 'Error' });
      }
      await fixture.whenStable();
      expect(home.savingTask).toBe(false);
      expect(home.taskDialogVisible).toBe(!success);
      if (success) expect(fixture.nativeElement.querySelector('.task-overlay')).toBeNull();
      else {
        expect(fixture.nativeElement.querySelector('.button--primary').disabled).toBe(false);
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
          'Impossible',
        );
      }
    },
  );

  it.each([
    ['A_FAIRE', 'EN_COURS', 1],
    ['EN_COURS', 'A_FAIRE', 1],
    ['A_FAIRE', 'TERMINEE', 1],
    ['EN_COURS', 'TERMINEE', 1],
    ['A_FAIRE', 'A_FAIRE', 0],
    ['EN_COURS', 'EN_COURS', 0],
  ])('%s -> %s has %s pending tasks without HTTP', async (original, target, count) => {
    const fixture = await loaded([task(original)]);
    select(fixture, target);
    await fixture.whenStable();
    expect(fixture.componentInstance.pendingStatuses.size).toBe(count);
    expect(fixture.componentInstance.groups[0].events[0].statusCode).toBe(original);
    expect(fixture.nativeElement.querySelectorAll('.event-row').length).toBe(1);
    const confirm = fixture.nativeElement.querySelector('.status-confirm');
    if (count) expect(confirm.textContent).toContain('Confirmer les changements (1)');
    else expect(confirm).toBeNull();
    requests.expectNone((req) => req.method === 'PATCH');
  });

  it('counts a task once across repeated selections, and cancels without HTTP', async () => {
    const fixture = await loaded();
    for (const code of ['EN_COURS', 'TERMINEE', 'EN_COURS']) {
      select(fixture, code);
      await fixture.whenStable();
      expect(fixture.componentInstance.pendingStatuses.size).toBe(1);
    }
    select(fixture, 'A_FAIRE');
    expect(fixture.componentInstance.pendingStatuses.size).toBe(0);
    select(fixture, 'EN_COURS');
    fixture.componentInstance.cancelStatusChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.pendingStatuses.size).toBe(0);
    expect(fixture.nativeElement.querySelector('select').value).toBe('A_FAIRE');
    requests.expectNone((req) => req.method === 'PATCH');
  });

  it('restores EN_COURS with a second circular-button click', async () => {
    const fixture = await loaded([task('EN_COURS')]);
    const event = fixture.componentInstance.groups[0].events[0];
    fixture.componentInstance.toggleTaskStatus(event);
    fixture.componentInstance.toggleTaskStatus(event);
    expect(fixture.componentInstance.pendingStatuses.size).toBe(0);
  });

  it('sends once, unlocks on response, and reloads the saved status with a new Home instance', async () => {
    const fixture = await loaded();
    select(fixture, 'EN_COURS');
    await fixture.whenStable();
    fixture.nativeElement.querySelector('.status-confirm').click();
    fixture.componentInstance.confirmStatusChanges();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.status-confirm').disabled).toBe(true);
    const patch = requests.expectOne(`${API_CONFIG.baseUrl}/taches/statuts`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ modifications: [{ tacheId: 'task-1', statutId: 20 }] });
    patch.flush([task('EN_COURS')]);
    // No refresh or extra change-detection cycle should be needed after the HTTP response.
    expect(fixture.nativeElement.querySelector('.status-confirm')).toBeNull();
    expect(fixture.nativeElement.querySelector('select').disabled).toBe(false);
    await fixture.whenStable();
    expect(fixture.componentInstance.statusesSaving).toBe(false);
    expect(fixture.componentInstance.pendingStatuses.size).toBe(0);
    expect(fixture.nativeElement.querySelector('select').value).toBe('EN_COURS');
    select(fixture, 'A_FAIRE');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.status-confirm').disabled).toBe(false);
    fixture.destroy();
    const reloaded = await loaded([task('EN_COURS')]);
    expect(reloaded.nativeElement.querySelector('select').value).toBe('EN_COURS');
    expect(reloaded.componentInstance.pendingStatuses.size).toBe(0);
  });

  it('keeps edits on HTTP error and supports retry', async () => {
    const fixture = await loaded();
    select(fixture, 'TERMINEE');
    fixture.componentInstance.confirmStatusChanges();
    requests
      .expectOne((req) => req.method === 'PATCH')
      .flush(null, { status: 500, statusText: 'Error' });
    expect(fixture.nativeElement.querySelector('.status-confirm').disabled).toBe(false);
    await fixture.whenStable();
    expect(fixture.componentInstance.statusesSaving).toBe(false);
    expect(fixture.componentInstance.pendingStatuses.size).toBe(1);
    expect(fixture.nativeElement.querySelector('.status-confirm').disabled).toBe(false);
    expect(fixture.componentInstance.groups.length).toBe(1);
    fixture.componentInstance.confirmStatusChanges();
    requests.expectOne((req) => req.method === 'PATCH').flush([task('TERMINEE')]);
    requests.expectOne(req => req.url.endsWith('/accueil')).flush(page([]));
    await fixture.whenStable();
    expect(fixture.componentInstance.statusesSaving).toBe(false);
    expect(fixture.componentInstance.pendingStatuses.size).toBe(0);
    expect(fixture.componentInstance.groups.length).toBe(0);
  });

  it.each(['null response', 'rendering failure'])(
    'unlocks and retains drafts after %s',
    async (reason) => {
      const fixture = await loaded();
      select(fixture, 'EN_COURS');
      fixture.componentInstance.confirmStatusChanges();
      requests
        .expectOne((req) => req.method === 'PATCH')
        .flush(
          reason === 'null response' ? null : [{ ...task('EN_COURS'), dateDebut: 'invalid-date' }],
        );
      await fixture.whenStable();
      expect(fixture.componentInstance.statusesSaving).toBe(false);
      expect(fixture.componentInstance.pendingStatuses.size).toBe(1);
      expect(fixture.componentInstance.statusSaveError).toBe(true);
      expect(fixture.componentInstance.groups[0].events[0].statusCode).toBe('A_FAIRE');
    },
  );

  it('handles an observable completing without a response', async () => {
    const fixture = await loaded();
    vi.spyOn(service, 'updateStatuses').mockReturnValue(EMPTY);
    select(fixture, 'EN_COURS');
    fixture.componentInstance.confirmStatusChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.statusesSaving).toBe(false);
    expect(fixture.componentInstance.statusSaveError).toBe(true);
    expect(fixture.componentInstance.pendingStatuses.size).toBe(1);
  });

  it('uses the first response without waiting for an unrelated stream to complete', async () => {
    const fixture = await loaded();
    const response = new Subject<TacheResponse[]>();
    vi.spyOn(service, 'updateStatuses').mockReturnValue(response);
    select(fixture, 'EN_COURS');
    fixture.componentInstance.confirmStatusChanges();
    response.next([task('EN_COURS')]);
    await fixture.whenStable();
    expect(fixture.componentInstance.statusesSaving).toBe(false);
    expect(fixture.componentInstance.pendingStatuses.size).toBe(0);
  });

  it('cancels the subscription and resets saving when Home is destroyed', async () => {
    const fixture = await loaded();
    select(fixture, 'EN_COURS');
    fixture.componentInstance.confirmStatusChanges();
    const patch = requests.expectOne((req) => req.method === 'PATCH');
    fixture.destroy();
    expect(patch.cancelled).toBe(true);
    expect(fixture.componentInstance.statusesSaving).toBe(false);
  });

  it('only displays A_FAIRE and EN_COURS', async () => {
    const fixture = await loaded(
      ['A_FAIRE', 'EN_COURS', 'TERMINEE', 'ANNULEE', 'UNKNOWN'].map((code) => task(code, code)),
    );
    expect(
      fixture.componentInstance.groups.flatMap((group) =>
        group.events.map((event) => event.statusCode),
      ),
    ).toEqual(['A_FAIRE', 'EN_COURS']);
  });

  it('ends calendar loading on a failed GET', async () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    flushParameters();
    requests
      .expectOne((req) => req.url.endsWith('/taches/accueil'))
      .flush(null, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(fixture.componentInstance.calendarLoading).toBe(false);
    expect(fixture.componentInstance.calendarError).toBe(true);
  });

  it('does not load protected calendar data during SSR initialization', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } },
        { provide: LoginService, useValue: { getCurrentUser: vi.fn() } },
      ],
    });
    const load = vi.spyOn(TestBed.inject(HomeCalendarService), 'loadHome');
    TestBed.runInInjectionContext(() => new HomeComponent().ngOnInit());
    expect(load).not.toHaveBeenCalled();
    expect(TestBed.inject(LoginService).getCurrentUser).not.toHaveBeenCalled();
  });
});

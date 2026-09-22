import { ChangeDetectorRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EMPTY, Subject } from 'rxjs';
import { HomeComponent } from './home';
import { HomeCalendarService, TacheResponse } from '../calendrier/home-calendar.service';
import { LoginService } from '../test-connexion/login.service';
import { API_CONFIG } from '../../core/config/api.config';

// Fixtures for isolated tests; application data still comes exclusively from the API.
const task = (code = 'A_FAIRE', id = 'task-1'): TacheResponse => ({
  id, titre: id, details: null, touteLaJournee: false,
  dateDebut: new Date().toISOString(), dateFin: null, createdAt: '', updatedAt: '',
  typeTache: { id: 1, code: 'TACHE', libelle: 'Tâche' },
  statut: { id: 2, code, libelle: code }, priorite: null,
});

describe('Home loading and status lifecycle (OnPush / zoneless)', () => {
  let requests: HttpTestingController;
  let service: HomeCalendarService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: LoginService, useValue: { getCurrentUser: () => null } }],
    });
    requests = TestBed.inject(HttpTestingController);
    service = TestBed.inject(HomeCalendarService);
  });

  afterEach(() => requests.verify());

  async function loaded(tasks = [task()]) {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    requests.expectOne(req => req.url.endsWith('/parametres')).flush([]);
    requests.expectOne(req => req.url.endsWith('/taches/calendrier')).flush(tasks);
    await fixture.whenStable();
    expect(fixture.componentInstance.calendarLoading).toBe(false);
    return fixture;
  }

  function select(fixture: Awaited<ReturnType<typeof loaded>>, code: string) {
    const element = fixture.nativeElement.querySelector('.status-select') as HTMLSelectElement;
    element.value = code;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it.each([
    ['A_FAIRE', 'EN_COURS', 1], ['EN_COURS', 'A_FAIRE', 1],
    ['A_FAIRE', 'TERMINEE', 1], ['EN_COURS', 'TERMINEE', 1],
    ['A_FAIRE', 'A_FAIRE', 0], ['EN_COURS', 'EN_COURS', 0],
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
    requests.expectNone(req => req.method === 'PATCH');
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
    requests.expectNone(req => req.method === 'PATCH');
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
    expect(patch.request.body).toEqual({ modifications: [{ tacheId: 'task-1', statutCode: 'EN_COURS' }] });
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
    requests.expectOne(req => req.method === 'PATCH').flush(null, { status: 500, statusText: 'Error' });
    expect(fixture.nativeElement.querySelector('.status-confirm').disabled).toBe(false);
    await fixture.whenStable();
    expect(fixture.componentInstance.statusesSaving).toBe(false);
    expect(fixture.componentInstance.pendingStatuses.size).toBe(1);
    expect(fixture.nativeElement.querySelector('.status-confirm').disabled).toBe(false);
    expect(fixture.componentInstance.groups.length).toBe(1);
    fixture.componentInstance.confirmStatusChanges();
    requests.expectOne(req => req.method === 'PATCH').flush([task('TERMINEE')]);
    await fixture.whenStable();
    expect(fixture.componentInstance.statusesSaving).toBe(false);
    expect(fixture.componentInstance.pendingStatuses.size).toBe(0);
    expect(fixture.componentInstance.groups.length).toBe(0);
  });

  it.each(['null response', 'rendering failure'])('unlocks and retains drafts after %s', async reason => {
    const fixture = await loaded();
    select(fixture, 'EN_COURS');
    fixture.componentInstance.confirmStatusChanges();
    requests.expectOne(req => req.method === 'PATCH').flush(reason === 'null response'
      ? null : [{ ...task('EN_COURS'), dateDebut: 'invalid-date' }]);
    await fixture.whenStable();
    expect(fixture.componentInstance.statusesSaving).toBe(false);
    expect(fixture.componentInstance.pendingStatuses.size).toBe(1);
    expect(fixture.componentInstance.statusSaveError).toBe(true);
    expect(fixture.componentInstance.groups[0].events[0].statusCode).toBe('A_FAIRE');
  });

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
    const patch = requests.expectOne(req => req.method === 'PATCH');
    fixture.destroy();
    expect(patch.cancelled).toBe(true);
    expect(fixture.componentInstance.statusesSaving).toBe(false);
  });

  it('only displays A_FAIRE and EN_COURS', async () => {
    const fixture = await loaded(['A_FAIRE', 'EN_COURS', 'TERMINEE', 'ANNULEE', 'UNKNOWN'].map(code => task(code, code)));
    expect(fixture.componentInstance.groups.flatMap(group => group.events.map(event => event.statusCode)))
      .toEqual(['A_FAIRE', 'EN_COURS']);
  });

  it('ends calendar loading on a failed GET', async () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    requests.expectOne(req => req.url.endsWith('/parametres')).flush([]);
    requests.expectOne(req => req.url.endsWith('/taches/calendrier')).flush(null, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(fixture.componentInstance.calendarLoading).toBe(false);
    expect(fixture.componentInstance.calendarError).toBe(true);
  });

  it('does not load protected calendar data during SSR initialization', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: 'server' },
      { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } },
      { provide: LoginService, useValue: { getCurrentUser: vi.fn() } },
    ] });
    const load = vi.spyOn(TestBed.inject(HomeCalendarService), 'loadCalendar');
    TestBed.runInInjectionContext(() => new HomeComponent().ngOnInit());
    expect(load).not.toHaveBeenCalled();
    expect(TestBed.inject(LoginService).getCurrentUser).not.toHaveBeenCalled();
  });
});

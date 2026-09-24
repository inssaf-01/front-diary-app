import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { HomeComponent } from './home';
import { HomeCalendarService, TacheResponse } from './home-calendar.service';
import { LoginService } from '../test-connexion/login.service';
import { taskParameters } from '../calendrier/task-parameters.fixture';

describe('Home API pagination', () => {
  const loadHome = vi.fn();
  const row = (id: string, dateDebut: string): TacheResponse => ({id, titre: id, dateDebut, dateFin: null, touteLaJournee: false,
    typeTacheId: taskParameters.typesTache[0].id, statutId: taskParameters.statuts.find(s => s.code === 'A_FAIRE')!.id,
    prioriteId: null, details: null, createdAt: '', updatedAt: ''});
  beforeEach(() => {
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(new Date(2026, 8, 23, 12));
    loadHome.mockReset();
    TestBed.configureTestingModule({imports: [HomeComponent], providers: [provideRouter([]),
      {provide: HomeCalendarService, useValue: {loadHome}}, {provide: LoginService, useValue: {getCurrentUser: () => null}}]});
  });
  afterEach(() => vi.useRealTimers());
  it('requests bounded pages and repeats the day title without losing pending edits', async () => {
    const tasks = [row('first', '2026-09-23T10:00:00+01:00'), row('second', '2026-09-23T18:30:00+01:00')];
    loadHome.mockImplementation((_start, _end, _past, page) => of({...taskParameters, taches: [tasks[page]], totalElements: 2}));
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.componentInstance.pageSize = 1;
    await fixture.whenStable();
    const home = fixture.componentInstance;
    expect(loadHome).toHaveBeenCalledWith(new Date(2026,8,23), new Date(2026,9,1), true, 0, 1);
    expect(home.totalTasks).toBe(2);
    const title = home.groups[0].label;
    home.toggleTaskStatus(home.groups[0].events[0]);
    home.changePage(2);
    await fixture.whenStable();
    expect(home.groups[0].label).toBe(title);
    expect(home.groups[0].events[0].id).toBe('second');
    expect(home.pendingStatuses.get('first')).toBe('TERMINEE');
    expect(fixture.nativeElement.querySelectorAll('.event-row').length).toBe(1);
    home.changePage(1);
    expect(home.pendingStatuses.get('first')).toBe('TERMINEE');
  });
  it('starts with a batch and fits all complete rows into the available space', async () => {
    const tasks = Array.from({length: 12}, (_, i) => row('task-'+String(i).padStart(2, '0'), '2026-09-23T10:00:00+01:00'));
    loadHome.mockImplementation((_start, _end, _past, _page, size) => of({...taskParameters, taches: tasks.slice(0, size), totalElements: 30}));
    const fixture = TestBed.createComponent(HomeComponent);
    await fixture.whenStable();
    expect(loadHome.mock.calls[0][4]).toBe(12);
    const list = fixture.nativeElement.querySelector('.timeline-list') as HTMLElement;
    Object.defineProperty(list, 'clientHeight', {value: 520});
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({bottom: 520} as DOMRect);
    const rows = Array.from(fixture.nativeElement.querySelectorAll('.event-row')) as HTMLElement[];
    rows.forEach((element, i) => {
      // Reproduce cards overflowing a compressed grid row: the row alone looks in bounds.
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({bottom: 100, height: 50} as DOMRect);
      vi.spyOn(element.querySelector('.event-card')!, 'getBoundingClientRect').mockReturnValue({bottom: 50 + (i+1)*58, height: 50} as DOMRect);
    });
    (fixture.componentInstance as unknown as {fitPage(): void}).fitPage();
    expect(fixture.componentInstance.pageSize).toBe(7);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.event-row').length).toBe(7);
    expect(fixture.componentInstance.totalPages).toBe(5);
  });
  it('sends the checkbox value to the API and returns to the first page', async () => {
    loadHome.mockReturnValue(of({...taskParameters, taches: [], totalElements: 0}));
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.componentInstance.pageSize = 1;
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('.task-list-controls input') as HTMLInputElement;
    expect(input.checked).toBe(true);
    input.click();
    await fixture.whenStable();
    expect(loadHome.mock.calls.at(-1)![2]).toBe(false);
    expect(fixture.componentInstance.currentPage).toBe(1);
    input.click();
    await fixture.whenStable();
    expect(loadHome.mock.calls.at(-1)![2]).toBe(true);
  });
  it('uses measured free space instead of the old four-card limit', async () => {
    loadHome.mockReturnValue(of({...taskParameters, taches: [row('first', '2026-09-23T10:00:00+01:00')], totalElements: 30}));
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.componentInstance.pageSize = 1;
    await fixture.whenStable();
    const list = fixture.nativeElement.querySelector('.timeline-list') as HTMLElement;
    const card = fixture.nativeElement.querySelector('.event-row') as HTMLElement;
    Object.defineProperty(list, 'clientHeight', {value: 600});
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({bottom: 600} as DOMRect);
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({bottom: 100, height: 50} as DOMRect);
    (fixture.componentInstance as unknown as {fitPage(): void}).fitPage();
    expect(fixture.componentInstance.pageSize).toBeGreaterThan(4);
    expect(loadHome.mock.calls.at(-1)![4]).toBe(fixture.componentInstance.pageSize);
  });
  it.each([[2026, 1, 28], [2028, 1, 29], [2026, 8, 30], [2026, 9, 31]])('computes the exclusive next-month boundary for %i/%i', async (year, month, days) => {
    vi.setSystemTime(new Date(year, month, 1, 12));
    loadHome.mockReturnValue(of({...taskParameters, taches: [], totalElements: 0}));
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.componentInstance.pageSize = 1;
    await fixture.whenStable();
    const [start, end] = loadHome.mock.calls[0];
    expect(start).toEqual(new Date(year, month, 1));
    expect(end).toEqual(new Date(year, month + 1, 1));
    expect(new Date(end.getFullYear(), end.getMonth(), 0).getDate()).toBe(days);
  });
  it('labels September and earlier work overdue on October 1 with its original date', async () => {
    vi.setSystemTime(new Date(2026, 9, 1, 12));
    loadHome.mockReturnValue(of({...taskParameters, taches: [row('old', '2025-05-10T10:00:00+01:00')], totalElements: 200}));
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.componentInstance.pageSize = 1;
    await fixture.whenStable();
    const home = fixture.componentInstance;
    expect(home.groups[0].label).toContain('En retard');
    expect(home.groups[0].dateLabel).toContain('2025');
    expect(home.totalPages).toBe(200);
    expect(home.pageNumbers.length).toBeLessThanOrEqual(5);
    expect(loadHome.mock.calls[0][1]).toEqual(new Date(2026,10,1));
  });
});


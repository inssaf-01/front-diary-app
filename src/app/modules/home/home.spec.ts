import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { HomeComponent } from './home';
import { HomeCalendarService, TacheResponse } from '../calendrier/home-calendar.service';
import { LoginService } from '../test-connexion/services/login';

describe('Home calendar', () => {
  // Fixtures uniquement pour les tests : ces objets ne sont jamais chargés par la Home réelle.
  let loadCalendar: ReturnType<typeof vi.fn>;
  const task = (id: string, day: number, hour = 10, priority = 'NORMALE', status = 'A_FAIRE'): TacheResponse => {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    date.setDate(date.getDate() + day);
    return {
      id, titre: id, details: null, dateDebut: date.toISOString(), dateFin: null,
      touteLaJournee: false, createdAt: '', updatedAt: '',
      typeTache: { id: 1, code: 'COURSES', libelle: 'Courses' },
      statut: { id: 2, code: status, libelle: status },
      priorite: { id: 3, code: priority, libelle: priority },
    };
  };

  beforeEach(() => {
    loadCalendar = vi.fn();
    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideRouter([]),
        { provide: HomeCalendarService, useValue: { loadCalendar } },
        { provide: LoginService, useValue: { getCurrentUser: () => null, getAccessToken: () => 'test-token' } },
      ],
    });
  });

  it('uses seven local calendar days and excludes past, terminal and boundary tasks', async () => {
    loadCalendar.mockReturnValue(of({ typesTache: [], taches: [
      task('past', -1), task('today', 0), task('last', 6), task('boundary', 7, 0),
      task('done', 1, 10, 'URGENTE', 'TERMINEE'), task('cancelled', 1, 10, 'HAUTE', 'ANNULEE'),
    ] }));
    const fixture = TestBed.createComponent(HomeComponent);
    await fixture.whenStable();
    const [start, end] = loadCalendar.mock.calls[0] as [Date, Date];
    const expected = new Date(start);
    expected.setDate(expected.getDate() + 7);
    expect(end.getTime()).toBe(expected.getTime());
    expect(start.getHours()).toBe(0);
    expect(fixture.componentInstance.groups.flatMap(g => g.events.map(e => e.id))).toEqual(['today', 'last']);
  });

  it('limits to seven tasks, sorting priority before time', async () => {
    loadCalendar.mockReturnValue(of({ typesTache: [], taches: [
      task('normal', 0, 8), task('urgent-late', 0, 17, 'URGENTE'), task('urgent-early', 0, 9, 'URGENTE'),
      task('second', 2), task('third-a', 4, 8), task('third-b', 4, 9), task('overflow', 4, 10), task('fourth', 5),
    ] }));
    const fixture = TestBed.createComponent(HomeComponent);
    await fixture.whenStable();
    const groups = fixture.componentInstance.groups;
    expect(groups.length).toBe(3);
    expect(groups.flatMap(g => g.events.map(e => e.id))).toEqual([
      'urgent-early', 'urgent-late', 'normal', 'second', 'third-a', 'third-b', 'overflow',
    ]);
    expect(groups[0].events[0].icon).toBe('pi-shopping-cart');
    expect(groups[0].events[0].tone).toBe('orange');
  });

  it('can display seven tasks across seven days without limiting the API results', async () => {
    const taches = Array.from({ length: 7 }, (_, day) => task(`day-${day}`, day));
    loadCalendar.mockReturnValue(of({ typesTache: [], taches }));
    const fixture = TestBed.createComponent(HomeComponent);
    await fixture.whenStable();
    const groups = fixture.componentInstance.groups;
    expect(groups.length).toBe(7);
    expect(groups.flatMap(group => group.events.map(event => event.id))).toEqual([
      'day-0', 'day-1', 'day-2', 'day-3', 'day-4', 'day-5', 'day-6',
    ]);
    expect(taches.length).toBe(7);
  });
});

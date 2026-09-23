import { TestBed } from '@angular/core/testing';
import { AjoutTacheComponent } from './ajout-tache';
import { taskParameters } from '../task-parameters.fixture';
import { TacheRequest, TacheResponse } from '../../home/home-calendar.service';

describe('Task form with API parameters', () => {
  function setup(task: TacheResponse | null = null) {
    const fixture = TestBed.createComponent(AjoutTacheComponent);
    fixture.componentRef.setInput('types', taskParameters.typesTache);
    fixture.componentRef.setInput('statuts', taskParameters.statuts);
    fixture.componentRef.setInput('priorites', taskParameters.priorites);
    fixture.componentRef.setInput('task', task);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    return fixture;
  }

  it('uses dynamic labels and submits numeric IDs and combined dates only', () => {
    const fixture = setup();
    const form = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Tâche personnalisée');
    form.form.patchValue({
      titre: 'Documentation',
      description: 'Guide',
      typeId: 10,
      statutId: 20,
      prioriteId: 30,
      dateDebut: '2026-09-23',
      heureDebut: '13:00',
      dateFin: '2026-09-23',
      heureFin: '14:30',
    });
    const emit = vi.spyOn(form.taskCreated, 'emit');
    form.submit();
    expect(emit).toHaveBeenCalledWith({
      titre: 'Documentation',
      details: 'Guide',
      typeTacheId: 10,
      statutId: 20,
      prioriteId: 30,
      touteLaJournee: false,
      dateDebut: new Date('2026-09-23T13:00:00').toISOString(),
      dateFin: new Date('2026-09-23T14:30:00').toISOString(),
    } satisfies TacheRequest);
  });

  it('uses response IDs for editing and preserves local times', () => {
    const fixture = setup({
      id: 'task',
      titre: 'Edit',
      details: 'Details',
      typeTacheId: 10,
      statutId: 20,
      prioriteId: null,
      touteLaJournee: false,
      dateDebut: new Date('2026-09-23T13:00:00').toISOString(),
      dateFin: null,
      createdAt: '',
      updatedAt: '',
    });
    const form = fixture.componentInstance;
    expect(form.form.getRawValue()).toMatchObject({
      typeId: 10,
      statutId: 20,
      prioriteId: null,
      heureDebut: '13:00',
      dateFin: '',
      titre: 'Edit',
    });
    const emit = vi.spyOn(form.taskCreated, 'emit');
    form.submit();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ typeTacheId: 10, statutId: 20, prioriteId: null, dateFin: null }),
    );
    expect(fixture.nativeElement.textContent).toContain('Enregistrer les modifications');
  });

  it('does not submit before required references are loaded', () => {
    const fixture = TestBed.createComponent(AjoutTacheComponent);
    const emit = vi.spyOn(fixture.componentInstance.taskCreated, 'emit');
    fixture.componentInstance.form.controls.titre.setValue('Test');
    fixture.componentInstance.submit();
    expect(emit).not.toHaveBeenCalled();
  });
});

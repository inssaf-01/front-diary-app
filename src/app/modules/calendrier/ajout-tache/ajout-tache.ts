import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

export interface TaskParameterOption {
  id: string;
  libelle: string;
  icon: string;
  color: string;
}

export interface CreateTaskPayload {
  typeId: string;
  titre: string;
  description: string;
  statutId: string;
  prioriteId: string;
  touteLaJournee: boolean;
  dateDebut: string;
  heureDebut: string | null;
  dateFin: string;
  heureFin: string | null;
}

@Component({
  selector: 'app-ajout-tache',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ajout-tache.html',
  styleUrl: './ajout-tache.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AjoutTacheComponent {
  private readonly fb = inject(FormBuilder);
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input() visible = false;
  @Input() saving = false;

  @Input() types: TaskParameterOption[] = [
    { id: 'TACHE', libelle: 'Tâche', icon: 'pi pi-check-square', color: '#7193ff' },
    { id: 'REUNION', libelle: 'Réunion', icon: 'pi pi-users', color: '#58c7ff' },
    { id: 'EVENEMENT', libelle: 'Événement', icon: 'pi pi-calendar', color: '#8e72ff' },
    { id: 'ANNIVERSAIRE', libelle: 'Anniversaire', icon: 'pi pi-gift', color: '#f36eae' },
    { id: 'COURSES', libelle: 'Courses', icon: 'pi pi-shopping-cart', color: '#f4a261' },
  ];

  @Input() statuts: TaskParameterOption[] = [
    { id: 'A_FAIRE', libelle: 'À faire', icon: 'pi pi-circle', color: '#7898c8' },
    { id: 'EN_COURS', libelle: 'En cours', icon: 'pi pi-play-circle', color: '#7b79ff' },
    { id: 'TERMINEE', libelle: 'Terminée', icon: 'pi pi-check-circle', color: '#66e6c2' },
    { id: 'ANNULEE', libelle: 'Annulée', icon: 'pi pi-times-circle', color: '#d47d9d' },
  ];

  @Input() priorites: TaskParameterOption[] = [
    { id: 'BASSE', libelle: 'Basse', icon: 'pi pi-arrow-down', color: '#7197c8' },
    { id: 'NORMALE', libelle: 'Normale', icon: 'pi pi-minus', color: '#5f8dff' },
    { id: 'HAUTE', libelle: 'Haute', icon: 'pi pi-arrow-up', color: '#f2a45f' },
    { id: 'URGENTE', libelle: 'Urgente', icon: 'pi pi-bolt', color: '#f06f91' },
  ];

  @Output() closed = new EventEmitter<void>();
  @Output() taskCreated = new EventEmitter<CreateTaskPayload>();

  openSelect: 'type' | 'statut' | 'priorite' | null = 'priorite';
  mobileStep = 1;

  readonly form = this.fb.nonNullable.group({
    typeId: ['EVENEMENT', Validators.required],
    titre: ['Séance de sport', [Validators.required, Validators.maxLength(100)]],
    description: [
      'Salle de sport, renforcement musculaire et 30 min de cardio.',
      Validators.maxLength(500),
    ],
    statutId: ['EN_COURS', Validators.required],
    prioriteId: ['URGENTE', Validators.required],
    touteLaJournee: [false],
    dateDebut: [this.today(), Validators.required],
    heureDebut: ['18:00'],
    dateFin: [this.today(), Validators.required],
    heureFin: ['19:30'],
  });

  get selectedType(): TaskParameterOption | undefined {
    return this.types.find((item) => item.id === this.form.controls.typeId.value);
  }

  get selectedStatut(): TaskParameterOption | undefined {
    return this.statuts.find((item) => item.id === this.form.controls.statutId.value);
  }

  get selectedPriorite(): TaskParameterOption | undefined {
    return this.priorites.find((item) => item.id === this.form.controls.prioriteId.value);
  }

  get descriptionLength(): number {
    return this.form.controls.description.value.length;
  }

  toggleSelect(name: 'type' | 'statut' | 'priorite', event: MouseEvent): void {
    event.stopPropagation();
    this.openSelect = this.openSelect === name ? null : name;
  }

  selectOption(
    control: 'typeId' | 'statutId' | 'prioriteId',
    option: TaskParameterOption,
    event: MouseEvent,
  ): void {
    event.stopPropagation();
    this.form.controls[control].setValue(option.id);
    this.openSelect = null;
  }

  setMobileStep(step: number): void {
    this.mobileStep = step;
    this.openSelect = null;
  }

  close(): void {
    this.openSelect = null;
    this.closed.emit();
  }

  submit(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.taskCreated.emit({
      ...value,
      heureDebut: value.touteLaJournee ? null : value.heureDebut,
      heureFin: value.touteLaJournee ? null : value.heureFin,
    });
  }

  @HostListener('document:click', ['$event'])
  closeLists(event: MouseEvent): void {
    if (this.openSelect && !this.host.nativeElement.contains(event.target as Node)) {
      this.openSelect = null;
    }
  }

  @HostListener('document:keydown.escape')
  escape(): void {
    if (!this.visible) return;
    if (this.openSelect) this.openSelect = null;
    else this.close();
  }

  private today(): string {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
  }
}

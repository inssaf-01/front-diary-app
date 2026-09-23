import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { TacheRequest, TacheResponse } from '../../home/home-calendar.service';

export interface TaskParameterOption {
  id: number;
  code: string;
  libelle: string;
  icon: string;
  color: string;
}

export type CreateTaskPayload = TacheRequest;

@Component({
  selector: 'app-ajout-tache',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ajout-tache.html',
  styleUrl: './ajout-tache.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AjoutTacheComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input() visible = false;
  @Input() saving = false;
  @Input() saveError = '';

  @Input() types: TaskParameterOption[] = [];
  @Input() statuts: TaskParameterOption[] = [];
  @Input() priorites: TaskParameterOption[] = [];
  @Input() task: TacheResponse | null = null;
  @Input() initialDate: string | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() taskCreated = new EventEmitter<CreateTaskPayload>();

  openSelect: 'type' | 'statut' | 'priorite' | null = null;
  mobileStep = 1;

  readonly form = this.fb.nonNullable.group({
    typeId: this.fb.control<number | null>(null, Validators.required),
    titre: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', Validators.maxLength(3000)],
    statutId: this.fb.control<number | null>(null, Validators.required),
    prioriteId: this.fb.control<number | null>(null),
    touteLaJournee: [false],
    dateDebut: [this.today(), Validators.required],
    heureDebut: ['18:00'],
    dateFin: [this.today()],
    heureFin: ['19:30'],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (
      !this.visible ||
      !(
        changes['visible'] ||
        changes['task'] ||
        changes['types'] ||
        changes['statuts'] ||
        changes['priorites']
      )
    )
      return;
    const availableId = (options: TaskParameterOption[], id: number | null) =>
      options.find((option) => option.id === id)?.id ?? null;
    const resolve = (options: TaskParameterOption[], code: string | null) =>
      options.find((option) => option.code === code)?.id ?? null;
    // References can arrive after opening: keep the user's draft intact.
    if (!changes['visible'] && !changes['task']) {
      const controls = this.form.controls;
      if (controls.typeId.value === null && controls.typeId.pristine) {
        controls.typeId.setValue(
          this.task
            ? availableId(this.types, this.task.typeTacheId)
            : (resolve(this.types, 'TACHE') ?? this.types[0]?.id ?? null),
        );
      }
      if (controls.statutId.value === null && controls.statutId.pristine) {
        controls.statutId.setValue(
          this.task
            ? availableId(this.statuts, this.task.statutId)
            : (resolve(this.statuts, 'A_FAIRE') ?? this.statuts[0]?.id ?? null),
        );
      }
      if (controls.prioriteId.value === null && controls.prioriteId.pristine) {
        controls.prioriteId.setValue(
          this.task
            ? availableId(this.priorites, this.task.prioriteId)
            : resolve(this.priorites, 'NORMALE'),
        );
        if (this.task?.prioriteId && controls.prioriteId.value === null) {
          controls.prioriteId.setErrors({ unavailable: true });
        }
      }
      return;
    }
    const localParts = (value: string | null) => {
      if (!value) return { date: '', time: '' };
      const date = new Date(value);
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
      return { date: local.slice(0, 10), time: local.slice(11, 16) };
    };
    const task = this.task;
    const start = localParts(task?.dateDebut ?? null);
    const end = localParts(task?.dateFin ?? null);
    this.form.reset({
      typeId: task
        ? availableId(this.types, task.typeTacheId)
        : (resolve(this.types, 'TACHE') ?? this.types[0]?.id ?? null),
      statutId: task
        ? availableId(this.statuts, task.statutId)
        : (resolve(this.statuts, 'A_FAIRE') ?? this.statuts[0]?.id ?? null),
      prioriteId: task
        ? availableId(this.priorites, task.prioriteId)
        : resolve(this.priorites, 'NORMALE'),
      titre: task?.titre ?? '',
      description: task?.details ?? '',
      touteLaJournee: task?.touteLaJournee ?? false,
      dateDebut: task ? start.date : (this.initialDate ?? this.today()),
      heureDebut: task ? start.time : '09:00',
      dateFin: task ? end.date : (this.initialDate ?? this.today()),
      heureFin: task ? end.time : '10:00',
    });
    if (task?.prioriteId && this.form.controls.prioriteId.value === null) {
      this.form.controls.prioriteId.setErrors({ unavailable: true });
    }
    this.mobileStep = 1;
    this.openSelect = null;
  }

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
    this.form.controls[control].markAsDirty();
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
    if (this.form.controls.dateFin.hasError('beforeStart')) {
      this.form.controls.dateFin.setErrors(null);
    }
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    if (value.typeId === null || value.statutId === null) return;
    const toInstant = (date: string, time: string) =>
      new Date(
        date + 'T' + (value.touteLaJournee ? '00:00' : time || '00:00') + ':00',
      ).toISOString();
    const dateDebut = toInstant(value.dateDebut, value.heureDebut);
    const dateFin = value.dateFin ? toInstant(value.dateFin, value.heureFin) : null;
    if (dateFin && dateFin < dateDebut) {
      this.form.controls.dateFin.setErrors({ beforeStart: true });
      return;
    }
    this.taskCreated.emit({
      typeTacheId: value.typeId,
      statutId: value.statutId,
      prioriteId: value.prioriteId,
      titre: value.titre,
      details: value.description,
      touteLaJournee: value.touteLaJournee,
      dateDebut,
      dateFin,
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

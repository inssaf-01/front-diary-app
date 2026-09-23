import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  DestroyRef,
  OnInit,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, finalize, first } from 'rxjs';
import { MainTopbarComponent } from '../../shared/layout/main-topbar/main-topbar';
import { LoginService } from '../test-connexion/login.service';
import { HomeCalendarService, TacheRequest } from '../home/home-calendar.service';
import { AjoutTacheComponent, TaskParameterOption } from '../calendrier/ajout-tache/ajout-tache';

type Tool = 'select' | 'pen' | 'eraser' | 'rectangle' | 'square' | 'circle' | 'arrow' | 'text';

type ElementType = 'stroke' | 'rectangle' | 'square' | 'circle' | 'arrow' | 'text';

interface Point {
  x: number;
  y: number;
}

interface DrawingElement {
  id: string;
  type: ElementType;
  color: string;
  fill: boolean;
  text: string;

  x: number;
  y: number;
  width: number;
  height: number;

  // Pour les flèches.
  x2?: number;
  y2?: number;

  // Pour les traits libres.
  points?: Point[];
}

interface Board {
  id: string;
  title: string;
  elements: DrawingElement[];
}

type Interaction =
  | {
      kind: 'create';
      pointerId: number;
      elementId: string;
      start: Point;
    }
  | {
      kind: 'move';
      pointerId: number;
      elementId: string;
      start: Point;
      original: DrawingElement;
    };

@Component({
  selector: 'app-atelier',
  standalone: true,
  imports: [CommonModule, MainTopbarComponent, AjoutTacheComponent],
  templateUrl: './atelier.html',
  styleUrl: './atelier.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtelierComponent implements OnInit, OnDestroy {
  @ViewChild('drawingSurface')
  drawingSurface!: ElementRef<SVGSVGElement>;
  @ViewChild('surfaceViewport') surfaceViewport!: ElementRef<HTMLDivElement>;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly login = inject(LoginService);
  private readonly calendar = inject(HomeCalendarService);
  private restoreDocumentScroll?: () => void;
  private textFocusTimer?: ReturnType<typeof setTimeout>;
  private readonly storageKey = 'equilibre-atelier-v2';

  user = { firstName: '', fullName: '', avatarUrl: '', status: '' };
  taskDialogVisible = false;
  savingTask = false;
  taskSaveError = '';
  private parametersLoading = false;
  taskTypes: TaskParameterOption[] = [];
  taskStatuses: TaskParameterOption[] = [];
  taskPriorities: TaskParameterOption[] = [];

  readonly width = 1800;
  readonly height = 1200;

  readonly palette = ['#a9b8ff', '#7ed7e1', '#e7a6cf', '#f4c58c', '#a8d9b2', '#f5f2ff'];

  boards: Board[] = this.loadBoards();
  activeBoardId = this.boards[0].id;

  tool: Tool = 'select';
  color = '#a9b8ff';
  filled = false;
  zoom = 1;

  selectedId: string | null = null;
  saveMessage = 'Enregistré';

  private interaction?: Interaction;
  private undoHistory: string[] = [];
  private redoHistory: string[] = [];
  private saveTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const current = this.login.getCurrentUser();
    this.user = {
      firstName: current?.username ?? '',
      fullName: current?.username ?? '',
      avatarUrl: '',
      status: current?.email ?? '',
    };
    // Scope the document scroll lock to this route and restore previous inline styles on exit.
    const locks = [this.document.documentElement, this.document.body].map((element) => ({
      element,
      overflow: element.style.getPropertyValue('overflow'),
      priority: element.style.getPropertyPriority('overflow'),
    }));
    locks.forEach(({ element }) => element.style.setProperty('overflow', 'hidden'));
    this.restoreDocumentScroll = () =>
      locks.forEach(({ element, overflow, priority }) => {
        if (overflow) element.style.setProperty('overflow', overflow, priority);
        else element.style.removeProperty('overflow');
      });
  }

  ngOnDestroy(): void {
    this.restoreDocumentScroll?.();
    clearTimeout(this.textFocusTimer);
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.persistBoards();
    }
  }

  openTaskDialog(): void {
    this.taskDialogVisible = true;
    this.taskSaveError = '';
    if (this.parametersLoading || (this.taskTypes.length && this.taskStatuses.length)) return;
    this.parametersLoading = true;
    this.calendar
      .loadParameters()
      .pipe(
        first(),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.parametersLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (data) => {
          const options = (items: typeof data.typesTache) =>
            items.map((item) => ({ ...item, icon: 'pi pi-calendar', color: '#a9b8ff' }));
          this.taskTypes = options(data.typesTache);
          this.taskStatuses = options(data.statuts);
          this.taskPriorities = options(data.priorites);
        },
        error: () => {
          this.taskSaveError =
            'Impossible de charger les listes. Fermez puis rouvrez le formulaire pour réessayer.';
        },
      });
  }

  closeTaskDialog(): void {
    if (!this.savingTask) this.taskDialogVisible = false;
  }

  createTask(payload: TacheRequest): void {
    if (this.savingTask) return;
    this.savingTask = true;
    this.taskSaveError = '';
    defer(() => this.calendar.createTask(payload))
      .pipe(
        first(),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.savingTask = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.taskDialogVisible = false;
        },
        error: () => {
          this.taskSaveError = 'Impossible d’enregistrer la tâche. Réessayez.';
        },
      });
  }

  get board(): Board {
    return this.boards.find((board) => board.id === this.activeBoardId)!;
  }

  get selectedElement(): DrawingElement | undefined {
    return this.board.elements.find((element) => element.id === this.selectedId);
  }

  get canUndo(): boolean {
    return this.undoHistory.length > 0;
  }

  get canRedo(): boolean {
    return this.redoHistory.length > 0;
  }

  get isDrawingTool(): boolean {
    return this.tool !== 'select' && this.tool !== 'eraser';
  }

  selectTool(tool: Tool): void {
    this.tool = tool;
    this.selectedId = null;
  }

  selectColor(color: string): void {
    this.color = color;

    const selected = this.selectedElement;
    if (!selected) return;

    this.recordHistory();
    selected.color = color;
    this.saveSoon();
  }

  toggleFill(): void {
    this.filled = !this.filled;

    const selected = this.selectedElement;
    if (!selected || !this.isShape(selected)) return;

    this.recordHistory();
    selected.fill = this.filled;
    this.saveSoon();
  }

  newBoard(): void {
    this.recordHistory();

    const board: Board = {
      id: this.newId(),
      title: `Nouveau tableau ${this.boards.length + 1}`,
      elements: [],
    };

    this.boards = [...this.boards, board];
    this.activeBoardId = board.id;
    this.selectedId = null;
    this.saveSoon();
  }

  selectBoard(id: string): void {
    this.activeBoardId = id;
    this.selectedId = null;
  }

  renameBoard(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    if (!value || value === this.board.title) return;

    this.recordHistory();
    this.board.title = value;
    this.saveSoon();
  }

  onSurfacePointerDown(event: PointerEvent): void {
    if (event.isPrimary === false || this.interaction) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const point = this.getPoint(event);
    this.selectedId = null;

    if (this.tool === 'select' || this.tool === 'eraser') return;

    if (this.tool === 'text') {
      this.recordHistory();

      const element: DrawingElement = {
        id: this.newId(),
        type: 'text',
        color: this.color,
        fill: false,
        text: '',
        x: point.x,
        y: point.y,
        width: 270,
        height: 110,
      };

      this.board.elements.push(element);
      this.selectedId = element.id;
      this.saveSoon();

      this.textFocusTimer = setTimeout(() => {
        this.document.getElementById(`text-${element.id}`)?.focus();
      });

      return;
    }

    this.recordHistory();

    const element: DrawingElement = {
      id: this.newId(),
      type: this.tool === 'pen' ? 'stroke' : this.tool,
      color: this.color,
      fill: this.filled,
      text: '',
      x: point.x,
      y: point.y,
      width: 1,
      height: 1,
      x2: point.x,
      y2: point.y,
      points: this.tool === 'pen' ? [point] : undefined,
    };

    this.board.elements.push(element);

    this.interaction = {
      kind: 'create',
      pointerId: event.pointerId,
      elementId: element.id,
      start: point,
    };

    this.drawingSurface.nativeElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  onElementPointerDown(event: PointerEvent, element: DrawingElement): void {
    event.stopPropagation();
    if (event.isPrimary === false || this.interaction) return;

    if (event.pointerType === 'mouse' && event.button !== 0) return;

    if (this.tool === 'eraser') {
      this.recordHistory();
      this.board.elements = this.board.elements.filter((candidate) => candidate.id !== element.id);
      this.selectedId = null;
      this.saveSoon();
      return;
    }

    if (this.tool !== 'select') return;

    this.selectedId = element.id;

    // Le clic dans une zone de texte sert à écrire.
    if ((event.target as Element).closest('textarea')) return;

    this.recordHistory();

    this.interaction = {
      kind: 'move',
      pointerId: event.pointerId,
      elementId: element.id,
      start: this.getPoint(event),
      original: structuredClone(element),
    };

    this.drawingSurface.nativeElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  onPointerUp(event: PointerEvent): void {
    const action = this.interaction;
    if (!action || action.pointerId !== event.pointerId) return;

    const element = this.findElement(action.elementId);

    if (action.kind === 'create' && element) {
      if (element.type === 'rectangle' || element.type === 'square' || element.type === 'circle') {
        // Un simple clic crée également une forme visible.
        if (element.width < 8 && element.height < 8) {
          element.width = element.type === 'rectangle' ? 180 : 120;
          element.height = element.type === 'rectangle' ? 110 : 120;
        }

        this.selectedId = element.id;
        this.tool = 'select';
      }

      if (element.type === 'arrow') {
        const dx = (element.x2 ?? element.x) - element.x;
        const dy = (element.y2 ?? element.y) - element.y;

        if (Math.hypot(dx, dy) < 8) {
          element.x2 = element.x + 130;
          element.y2 = element.y;
        }
      }
    }

    this.interaction = undefined;
    const surface = this.drawingSurface.nativeElement;
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
    this.saveSoon();
  }

  onTextFocus(element: DrawingElement): void {
    this.selectedId = element.id;
    this.recordHistory();
  }

  onTextInput(element: DrawingElement, event: Event): void {
    element.text = (event.target as HTMLTextAreaElement).value;
    this.saveSoon();
  }

  deleteSelected(): void {
    if (!this.selectedId) return;

    this.recordHistory();
    this.board.elements = this.board.elements.filter((element) => element.id !== this.selectedId);
    this.selectedId = null;
    this.saveSoon();
  }

  undo(): void {
    const previous = this.undoHistory.pop();
    if (!previous) return;

    this.redoHistory.push(this.snapshot());
    this.restore(previous);
  }

  redo(): void {
    const next = this.redoHistory.pop();
    if (!next) return;

    this.undoHistory.push(this.snapshot());
    this.restore(next);
  }

  changeZoom(amount: number): void {
    if (this.interaction) return;
    const nextZoom = Math.max(0.5, Math.min(1.5, Math.round((this.zoom + amount) * 10) / 10));
    if (nextZoom === this.zoom) return;
    const viewport = this.surfaceViewport.nativeElement;
    const center = {
      x: (viewport.scrollLeft + viewport.clientWidth / 2) / this.zoom,
      y: (viewport.scrollTop + viewport.clientHeight / 2) / this.zoom,
    };
    this.zoom = nextZoom;
    // Update the SVG's scroll footprint before restoring the same logical point at the center.
    this.cdr.detectChanges();
    viewport.scrollLeft = Math.max(0, center.x * this.zoom - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, center.y * this.zoom - viewport.clientHeight / 2);
  }

  isShape(element: DrawingElement): boolean {
    return element.type === 'rectangle' || element.type === 'square' || element.type === 'circle';
  }

  pathFor(element: DrawingElement): string {
    const points = element.points ?? [];

    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
  }

  arrowHead(element: DrawingElement): string {
    const x1 = element.x;
    const y1 = element.y;
    const x2 = element.x2 ?? x1;
    const y2 = element.y2 ?? y1;

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const length = 18;
    const spread = Math.PI / 6;

    const leftX = x2 - length * Math.cos(angle - spread);
    const leftY = y2 - length * Math.sin(angle - spread);
    const rightX = x2 - length * Math.cos(angle + spread);
    const rightY = y2 - length * Math.sin(angle + spread);

    return `${leftX},${leftY} ${x2},${y2} ${rightX},${rightY}`;
  }

  trackById(_: number, element: { id: string }): string {
    return element.id;
  }

  private resizeShape(element: DrawingElement, start: Point, end: Point): void {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    if (element.type === 'square' || element.type === 'circle') {
      const size = Math.max(Math.abs(dx), Math.abs(dy));

      element.x = dx < 0 ? start.x - size : start.x;
      element.y = dy < 0 ? start.y - size : start.y;
      element.width = size;
      element.height = size;
      return;
    }

    element.x = Math.min(start.x, end.x);
    element.y = Math.min(start.y, end.y);
    element.width = Math.abs(dx);
    element.height = Math.abs(dy);
  }

  private getPoint(event: PointerEvent): Point {
    const svg = this.drawingSurface.nativeElement;
    const rect = svg.getBoundingClientRect();

    // 1. Calcul des coordonnées par rapport aux limites visibles du SVG
    const clientX = event.clientX - rect.left;
    const clientY = event.clientY - rect.top;

    // 2. Conversion vers l'espace de coordonnées virtuelles du viewBox (1800x1200)
    // rect.width et rect.height reflètent déjà la taille affichée liée au zoom
    const scaleX = this.width / rect.width;
    const scaleY = this.height / rect.height;

    return {
      x: clientX * scaleX,
      y: clientY * scaleY,
    };
  }

  private findElement(id: string): DrawingElement | undefined {
    return this.board.elements.find((element) => element.id === id);
  }

  private recordHistory(): void {
    this.undoHistory.push(this.snapshot());

    if (this.undoHistory.length > 60) {
      this.undoHistory.shift();
    }

    this.redoHistory = [];
  }

  private snapshot(): string {
    return JSON.stringify({
      boards: this.boards,
      activeBoardId: this.activeBoardId,
    });
  }

  private restore(value: string): void {
    const state = JSON.parse(value) as {
      boards: Board[];
      activeBoardId: string;
    };

    this.boards = state.boards;
    this.activeBoardId = state.activeBoardId;
    this.selectedId = null;
    this.saveSoon();
    this.cdr.markForCheck();
  }

  private saveSoon(): void {
    this.saveMessage = 'Enregistrement…';
    clearTimeout(this.saveTimer);

    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.persistBoards();
      this.cdr.markForCheck();
    }, 350);
  }

  private persistBoards(): void {
    try {
      localStorage.setItem(this.storageKey, this.snapshot());
      this.saveMessage = 'Enregistré à l’instant';
    } catch {
      this.saveMessage = 'Enregistrement impossible';
    }
  }
  // Méthode pour étendre dynamiquement le tableau quand on s'approche du bord
  private expandCanvasIfNeeded(x: number, y: number): void {
    const padding = 300; // Marge de sécurité
    let changed = false;

    if (x > this.width - 50) {
      (this as any).width = Math.ceil(x + padding);
      changed = true;
    }
    if (y > this.height - 50) {
      (this as any).height = Math.ceil(y + padding);
      changed = true;
    }

    if (changed) {
      this.cdr.markForCheck();
    }
  }

  // À intégrer dans ton onPointerMove existentiel :
  onPointerMove(event: PointerEvent): void {
    const action = this.interaction;
    if (!action || action.pointerId !== event.pointerId) return;

    const element = this.findElement(action.elementId);
    if (!element) return;

    const point = this.getPoint(event);

    // Vérifier et agrandir le canvas au besoin pendant qu'on dessine/déplace
    this.expandCanvasIfNeeded(point.x, point.y);

    if (action.kind === 'create') {
      if (element.type === 'stroke') {
        element.points!.push(point);
      } else if (element.type === 'arrow') {
        element.x2 = point.x;
        element.y2 = point.y;
      } else {
        this.resizeShape(element, action.start, point);
      }
    } else {
      const dx = point.x - action.start.x;
      const dy = point.y - action.start.y;

      element.x = action.original.x + dx;
      element.y = action.original.y + dy;

      if (element.type === 'arrow') {
        element.x2 = (action.original.x2 ?? action.original.x) + dx;
        element.y2 = (action.original.y2 ?? action.original.y) + dy;
      }

      if (element.type === 'stroke') {
        element.points = action.original.points?.map((p) => ({
          x: p.x + dx,
          y: p.y + dy,
        }));
      }
    }
  }

  private loadBoards(): Board[] {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(this.storageKey);

        if (saved) {
          const state = JSON.parse(saved) as { boards: Board[] };
          if (state.boards?.length) return state.boards;
        }
      }
    } catch {
      // Un stockage local invalide ne bloque pas l’atelier.
    }

    return [
      {
        id: 'premier-tableau',
        title: 'Idées pour un automne plus doux',
        elements: [
          {
            id: 'idee-lecture',
            type: 'rectangle',
            color: '#e7a6cf',
            fill: true,
            text: 'Réorganiser le coin lecture\nUne lumière douce, un plaid et quelques livres.',
            x: 110,
            y: 180,
            width: 350,
            height: 190,
          },
          {
            id: 'idee-repas',
            type: 'rectangle',
            color: '#a9b8ff',
            fill: true,
            text: 'Repas de la semaine\n• Soupe de légumes\n• Quiche maison\n• Pâtes au pesto',
            x: 620,
            y: 160,
            width: 350,
            height: 220,
          },
          {
            id: 'idee-balade',
            type: 'circle',
            color: '#7ed7e1',
            fill: true,
            text: 'Balade\n dimanche',
            x: 1160,
            y: 170,
            width: 240,
            height: 240,
          },
          {
            id: 'lien-repas-balade',
            type: 'arrow',
            color: '#f4c58c',
            fill: false,
            text: '',
            x: 990,
            y: 275,
            width: 0,
            height: 0,
            x2: 1130,
            y2: 275,
          },
        ],
      },
    ];
  }

  private newId(): string {
    return crypto.randomUUID();
  }
}

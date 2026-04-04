import { ChangeDetectorRef, Component, HostListener, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import {
  TimetableService,
  TimetableVersion,
  TimetableSlot,
  TimetableConfig,
} from '../../../services/timetable.service';
import { TeacherService } from '../../../services/teacher.service';
import { ClassService } from '../../../services/class.service';
import { TimetablePreviewBuilderService } from '../timetable-preview-builder.service';
import { formatClassTimetableTeacherLabel } from '../../../utils/teacher-timetable-label.util';

/** Class-based colors (dense timetable style — same class keeps the same color). */
const CLASS_COLOR_PALETTE = [
  '#0f766e',
  '#65a30d',
  '#ca8a04',
  '#db2777',
  '#2563eb',
  '#7c3aed',
  '#ea580c',
  '#059669',
  '#4f46e5',
  '#be123c',
  '#0e7490',
  '#a16207',
  '#4338ca',
  '#9f1239',
  '#047857',
];

function classColorForId(classId: string): string {
  let h = 0;
  for (let i = 0; i < classId.length; i++) {
    h = classId.charCodeAt(i) + ((h << 5) - h);
  }
  return CLASS_COLOR_PALETTE[Math.abs(h) % CLASS_COLOR_PALETTE.length];
}

function abbrevTeacherRowLabel(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '—';
  }
  if (parts.length === 1) {
    const w = parts[0];
    return w.length <= 2 ? w.toUpperCase() : (w[0] + w[1]).toUpperCase();
  }
  const first = parts[0][0] || '';
  const last = parts[parts.length - 1][0] || '';
  return (first + last).toUpperCase();
}

function abbrevClassRowLabel(className: string): string {
  const t = className.trim();
  if (!t) {
    return '—';
  }
  if (t.length <= 4) {
    return t.toUpperCase();
  }
  return t.slice(0, 4).toUpperCase();
}

@Component({
  selector: 'app-timetable-manual-adjustments',
  templateUrl: './timetable-manual-adjustments.component.html',
  styleUrls: ['./timetable-manual-adjustments.component.css'],
})
export class TimetableManualAdjustmentsComponent implements OnInit {
  versions: TimetableVersion[] = [];
  selectedVersionId = '';
  config: TimetableConfig | null = null;
  /** All teaching slots for the selected version (for drag + collision checks). */
  allSlots: TimetableSlot[] = [];

  /** Row axis: teachers or classes. */
  viewKind: 'teacher' | 'class' = 'teacher';
  /** Filter to one teacher/class id, or '' for all. */
  filterEntityId = '';

  teachers: any[] = [];
  classes: any[] = [];

  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;
  conflictMessage: string | null = null;

  readonly dayOrder = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  periods: number[] = [];
  dragSlot: TimetableSlot | null = null;
  dragOverKey: string | null = null;
  /** Lesson picked (raised card); normalized string id from API. */
  liftedSlotId: string | null = null;
  /** Cached grid — avoids *ngFor destroying rows every CD (breaks pick / lift). */
  gridRows: { id: string; name: string; rowLabel: string }[] = [];
  gridDays: string[] = [];
  /** True after mousedown on card so the following click does not double-toggle. */
  private liftHandledByMouseDown = false;
  /** Right-click menu for Lock / Unlock */
  contextMenu: { x: number; y: number; slot: TimetableSlot } | null = null;

  constructor(
    private timetableService: TimetableService,
    private teacherService: TeacherService,
    private classService: ClassService,
    private cdr: ChangeDetectorRef,
    private previewBuilder: TimetablePreviewBuilderService
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const el = ev.target as HTMLElement;
    if (el?.closest?.('.tta-ctx')) {
      return;
    }
    if (el?.closest?.('.tta-card')) {
      return;
    }
    /* Clicks on the grid (empty cells, headers) are handled there; don't clear lift from a stray document phase. */
    if (el?.closest?.('.tta-grid')) {
      this.contextMenu = null;
      return;
    }
    this.contextMenu = null;
    this.liftedSlotId = null;
    this.dragOverKey = null;
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Escape') {
      return;
    }
    this.liftedSlotId = null;
    this.dragOverKey = null;
    this.contextMenu = null;
  }

  /** Slot currently being positioned (drag takes precedence over click-lift). */
  activeMoveSlot(): TimetableSlot | null {
    if (this.dragSlot) {
      return this.dragSlot;
    }
    if (!this.liftedSlotId) {
      return null;
    }
    return (
      this.allSlots.find((s) => this.normId(s.id) === this.normId(this.liftedSlotId)) ?? null
    );
  }

  ngOnInit(): void {
    this.teacherService.getTeachers().subscribe({
      next: (t) => (this.teachers = Array.isArray(t) ? t : []),
      error: () => (this.teachers = []),
    });
    this.classService.getClasses().subscribe({
      next: (c) => {
        const list = Array.isArray(c) ? c : c?.data || [];
        this.classes = this.classService.sortClasses(list);
      },
      error: () => (this.classes = []),
    });
    this.loadVersions();
  }

  loadVersions(): void {
    this.loading = true;
    this.timetableService.getVersions().subscribe({
      next: (versions) => {
        this.versions = versions;
        const active = versions.find((v) => v.isActive) || versions[0];
        if (active) {
          this.selectedVersionId = active.id;
          this.refreshData();
        } else {
          this.loading = false;
        }
      },
      error: (err) => {
        console.error(err);
        this.error = 'Failed to load timetable versions';
        this.loading = false;
      },
    });
  }

  onVersionChange(): void {
    this.conflictMessage = null;
    this.liftedSlotId = null;
    this.dragOverKey = null;
    this.refreshData();
  }

  onViewKindChange(): void {
    this.filterEntityId = '';
    this.conflictMessage = null;
    this.liftedSlotId = null;
    this.dragOverKey = null;
    this.refreshGridLayout();
  }

  onFilterEntityChange(): void {
    this.refreshGridLayout();
  }

  refreshData(): void {
    if (!this.selectedVersionId) {
      return;
    }
    this.loading = true;
    this.error = null;
    forkJoin({
      slots: this.timetableService.getSlots(this.selectedVersionId),
      config: this.timetableService.getConfig().pipe(catchError(() => of(null as TimetableConfig | null))),
    }).subscribe({
      next: ({ slots, config }) => {
        this.config = config;
        this.allSlots = (slots || []).filter((s) => !s.isBreak);
        this.buildPeriods();
        this.refreshGridLayout();
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = 'Failed to load timetable slots';
        this.loading = false;
      },
    });
  }

  private buildPeriods(): void {
    if (this.config?.periodsPerDay && this.config.periodsPerDay > 0) {
      this.periods = Array.from({ length: this.config.periodsPerDay }, (_, i) => i + 1);
      return;
    }
    const set = new Set<number>();
    this.allSlots.forEach((s) => set.add(s.periodNumber));
    this.periods = Array.from(set).sort((a, b) => a - b);
    if (this.periods.length === 0) {
      this.periods = [1, 2, 3, 4, 5, 6, 7, 8];
    }
  }

  private computeSortedDays(): string[] {
    if (this.config?.daysOfWeek?.length) {
      return [...this.config.daysOfWeek].sort(
        (a, b) => this.dayOrder.indexOf(a) - this.dayOrder.indexOf(b)
      );
    }
    const d = [...new Set(this.allSlots.map((s) => s.dayOfWeek))];
    return d.sort((a, b) => this.dayOrder.indexOf(a) - this.dayOrder.indexOf(b));
  }

  /** Rebuild cached row/day lists when data or view changes (keeps table DOM stable). */
  refreshGridLayout(): void {
    this.gridDays = this.computeSortedDays();
    this.gridRows = this.viewKind === 'teacher' ? this.teacherRows() : this.classRows();
  }

  /** Short day label for dense header (Mon, Tue, …). */
  dayHeadingShort(day: string): string {
    if (!day || day.length < 3) {
      return day;
    }
    return day.slice(0, 3);
  }

  trackRowById(_: number, row: { id: string }): string {
    return row.id;
  }

  normId(id: string | undefined | null): string {
    return id != null && id !== '' ? String(id) : '';
  }

  isSlotLifted(slot: TimetableSlot): boolean {
    if (this.slotIsLocked(slot)) {
      return false;
    }
    const sid = this.normId(slot.id);
    if (this.dragSlot && this.normId(this.dragSlot.id) === sid) {
      return true;
    }
    if (!this.liftedSlotId) {
      return false;
    }
    return this.normId(this.liftedSlotId) === sid;
  }

  pickedSlotLabel(): string {
    if (!this.liftedSlotId) {
      return '';
    }
    const slot = this.allSlots.find((s) => this.normId(s.id) === this.normId(this.liftedSlotId));
    if (!slot) {
      return this.liftedSlotId;
    }
    return `${this.cardPrimaryLabel(slot)} · ${this.cardSecondaryLabel(slot)}`;
  }

  clearPickedLesson(): void {
    this.liftedSlotId = null;
    this.dragOverKey = null;
    this.cdr.detectChanges();
  }

  private teacherRows(): { id: string; name: string; rowLabel: string }[] {
    const map = new Map<string, string>();
    this.allSlots.forEach((s) => {
      const nm = s.teacher
        ? `${s.teacher.firstName || ''} ${s.teacher.lastName || ''}`.trim()
        : 'Teacher';
      map.set(s.teacherId, nm || 'Teacher');
    });
    let rows = [...map.entries()].map(([id, name]) => ({
      id,
      name,
      rowLabel: abbrevTeacherRowLabel(name),
    }));
    rows.sort((a, b) => a.name.localeCompare(b.name));
    if (this.filterEntityId) {
      rows = rows.filter((r) => r.id === this.filterEntityId);
    }
    return rows;
  }

  private classRows(): { id: string; name: string; rowLabel: string }[] {
    const map = new Map<string, string>();
    this.allSlots.forEach((s) => {
      map.set(s.classId, s.class?.name || 'Class');
    });
    let rows = [...map.entries()].map(([id, name]) => ({
      id,
      name,
      rowLabel: abbrevClassRowLabel(name),
    }));
    rows.sort((a, b) => a.name.localeCompare(b.name));
    if (this.filterEntityId) {
      rows = rows.filter((r) => r.id === this.filterEntityId);
    }
    return rows;
  }

  teacherFilterOptions(): { id: string; name: string }[] {
    return this.teachers
      .map((t) => ({
        id: t.id,
        name: `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.teacherId || t.id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  classFilterOptions(): { id: string; name: string }[] {
    return this.classes.map((c) => ({ id: c.id, name: c.name || c.form || c.id }));
  }

  cellKey(rowId: string, day: string, period: number): string {
    return `${rowId}|${day}|${period}`;
  }

  cellSlot(rowId: string, day: string, period: number): TimetableSlot | null {
    const rid = this.normId(rowId);
    if (this.viewKind === 'teacher') {
      return (
        this.allSlots.find(
          (s) =>
            this.normId(s.teacherId) === rid && s.dayOfWeek === day && s.periodNumber === period
        ) || null
      );
    }
    return (
      this.allSlots.find(
        (s) =>
          this.normId(s.classId) === rid && s.dayOfWeek === day && s.periodNumber === period
      ) || null
    );
  }

  cardColor(slot: TimetableSlot): string {
    return classColorForId(slot.classId);
  }

  subjectAbbrev(slot: TimetableSlot): string {
    const code = slot.subject?.code?.trim();
    if (code) {
      return code.length > 6 ? code.slice(0, 6) : code;
    }
    const name = slot.subject?.name?.trim() || '—';
    return name.length > 5 ? name.slice(0, 5) : name;
  }

  /** Primary line: class (by teacher) or subject (by class), wall-chart style. */
  cardPrimaryLabel(slot: TimetableSlot): string {
    if (this.viewKind === 'class') {
      const a = this.previewBuilder.subjectLabelClassTimetable(slot);
      return a.length > 8 ? a.slice(0, 8) : a;
    }
    const raw = (slot.class?.name || slot.class?.form || '').trim();
    if (!raw) {
      return '—';
    }
    return raw.length > 10 ? raw.slice(0, 10) : raw;
  }

  /** Second line: subject (by teacher) or teacher initials (by class). */
  cardSecondaryLabel(slot: TimetableSlot): string {
    if (this.viewKind === 'class') {
      const t = slot.teacher;
      if (!t) {
        return '—';
      }
      return formatClassTimetableTeacherLabel(t.firstName, t.lastName, t.gender, t.maritalStatus);
    }
    return this.subjectAbbrev(slot);
  }

  onDragStart(slot: TimetableSlot, ev: DragEvent): void {
    if (this.slotIsLocked(slot)) {
      ev.preventDefault();
      this.dragSlot = null;
      this.conflictMessage = 'This lesson is locked. Right-click the card and choose Unlock to move it.';
      return;
    }
    this.dragSlot = slot;
    this.liftedSlotId = this.normId(slot.id);
    this.conflictMessage = null;
    ev.dataTransfer?.setData('text/plain', this.normId(slot.id));
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
    }
  }

  onCardContextMenu(slot: TimetableSlot, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.contextMenu = { x: ev.clientX, y: ev.clientY, slot };
  }

  /**
   * Select lesson on mousedown. If already selected, do nothing so HTML5 drag can start.
   * Do not toggle off here — that would cancel drag on the same gesture.
   */
  onCardMouseDown(slot: TimetableSlot, ev: MouseEvent): void {
    if (ev.button !== 0) {
      return;
    }
    ev.stopPropagation();
    this.contextMenu = null;
    const sid = this.normId(slot.id);
    if (!sid) {
      this.conflictMessage = 'This slot has no id — refresh the timetable.';
      this.cdr.detectChanges();
      return;
    }
    if (this.slotIsLocked(slot)) {
      this.conflictMessage = 'This lesson is locked. Right-click to unlock before moving.';
      this.cdr.detectChanges();
      return;
    }
    if (this.normId(this.liftedSlotId) === sid) {
      return;
    }
    this.liftedSlotId = sid;
    this.dragOverKey = null;
    this.conflictMessage = null;
    this.liftHandledByMouseDown = true;
    this.cdr.detectChanges();
  }

  /**
   * Second click on the same card deselects. Click after mousedown-select is ignored once.
   */
  onCardClick(slot: TimetableSlot, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.contextMenu = null;
    const sid = this.normId(slot.id);
    if (!sid) {
      return;
    }
    if (this.slotIsLocked(slot)) {
      this.conflictMessage = 'This lesson is locked. Right-click to unlock before moving.';
      this.cdr.detectChanges();
      return;
    }
    if (this.liftHandledByMouseDown) {
      this.liftHandledByMouseDown = false;
      this.cdr.detectChanges();
      return;
    }
    if (this.normId(this.liftedSlotId) === sid) {
      this.liftedSlotId = null;
      this.dragOverKey = null;
      this.conflictMessage = null;
    } else {
      this.liftedSlotId = sid;
      this.dragOverKey = null;
      this.conflictMessage = null;
    }
    this.cdr.detectChanges();
  }

  onCardKeyActivate(slot: TimetableSlot, ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    this.contextMenu = null;
    const sid = this.normId(slot.id);
    if (!sid) {
      return;
    }
    if (this.slotIsLocked(slot)) {
      this.conflictMessage = 'This lesson is locked. Right-click to unlock before moving.';
      this.cdr.detectChanges();
      return;
    }
    if (this.normId(this.liftedSlotId) === sid) {
      this.liftedSlotId = null;
      this.dragOverKey = null;
    } else {
      this.liftedSlotId = sid;
      this.dragOverKey = null;
    }
    this.conflictMessage = null;
    this.cdr.detectChanges();
  }

  slotIsLocked(slot: TimetableSlot): boolean {
    return slot.isLocked === true || (slot as any).isLocked === 'true' || (slot as any).isLocked === 1;
  }

  onGridCellClick(rowId: string, day: string, period: number, ev: MouseEvent): void {
    if (!this.liftedSlotId || this.dragSlot) {
      return;
    }
    const target = ev.target as HTMLElement;
    if (target.closest('.tta-card')) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const slot = this.allSlots.find((s) => this.normId(s.id) === this.normId(this.liftedSlotId));
    if (!slot) {
      return;
    }
    const occupying = this.cellSlot(rowId, day, period);
    if (occupying && this.normId(occupying.id) !== this.normId(slot.id)) {
      this.conflictMessage =
        'That cell already has a lesson. Choose an empty cell, or use two steps to swap.';
      return;
    }
    this.applyMoveToCell(slot, rowId, day, period);
  }

  onCellHoverEnter(rowId: string, day: string, period: number): void {
    if (this.activeMoveSlot()) {
      this.dragOverKey = this.cellKey(rowId, day, period);
    }
  }

  onCellHoverLeave(ev: MouseEvent): void {
    if (!this.activeMoveSlot()) {
      return;
    }
    const related = ev.relatedTarget as Node | null;
    if (related && (ev.currentTarget as HTMLElement).contains(related)) {
      return;
    }
    this.dragOverKey = null;
  }

  applyContextLockToggle(): void {
    const cm = this.contextMenu;
    this.contextMenu = null;
    if (!cm) {
      return;
    }
    const nextLocked = !cm.slot.isLocked;
    this.saving = true;
    this.conflictMessage = null;
    this.error = null;
    this.timetableService.updateSlot(cm.slot.id, { isLocked: nextLocked }).subscribe({
      next: () => {
        this.saving = false;
        this.success = nextLocked ? 'Lesson locked — it can no longer be dragged.' : 'Lesson unlocked — you can move it again.';
        this.refreshData();
        setTimeout(() => (this.success = null), 3500);
      },
      error: (err) => {
        this.saving = false;
        this.conflictMessage = err.error?.message || err.message || 'Could not update lock.';
      },
    });
  }

  onDragEnd(): void {
    /** Defer clearing so `drop` always runs first in browsers where `dragend` can race. */
    setTimeout(() => {
      this.dragSlot = null;
      this.dragOverKey = null;
      this.cdr.detectChanges();
    }, 0);
  }

  onDragLeaveCell(ev: DragEvent): void {
    const related = ev.relatedTarget as Node | null;
    if (related && (ev.currentTarget as HTMLElement).contains(related)) {
      return;
    }
    this.dragOverKey = null;
  }

  /** True while dragging if dropping here would be blocked (same as onDrop pre-checks). */
  isInvalidDropTarget(rowId: string, day: string, period: number): boolean {
    const slot = this.activeMoveSlot();
    if (!slot) {
      return false;
    }
    if (this.slotIsLocked(slot)) {
      return true;
    }
    if (this.viewKind === 'teacher' && this.normId(rowId) !== this.normId(slot.teacherId)) {
      return true;
    }
    if (this.viewKind === 'class' && this.normId(rowId) !== this.normId(slot.classId)) {
      return true;
    }
    const nextTeacherId = this.viewKind === 'teacher' ? rowId : slot.teacherId;
    const nextClassId = this.viewKind === 'class' ? rowId : slot.classId;
    const otherTeacherSlot = this.allSlots.some(
      (s) =>
        this.normId(s.id) !== this.normId(slot.id) &&
        this.normId(s.teacherId) === this.normId(nextTeacherId) &&
        s.dayOfWeek === day &&
        s.periodNumber === period
    );
    if (otherTeacherSlot) {
      return true;
    }
    const otherClassSlot = this.allSlots.some(
      (s) =>
        this.normId(s.id) !== this.normId(slot.id) &&
        this.normId(s.classId) === this.normId(nextClassId) &&
        s.dayOfWeek === day &&
        s.periodNumber === period
    );
    if (otherClassSlot) {
      return true;
    }
    return false;
  }

  onDragOver(ev: DragEvent, rowId: string, day: string, period: number): void {
    ev.preventDefault();
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = 'move';
    }
    this.dragOverKey = this.cellKey(rowId, day, period);
  }

  onDrop(rowId: string, day: string, period: number, ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.dragOverKey = null;
    const rawId = ev.dataTransfer?.getData('text/plain') || this.dragSlot?.id;
    const id = this.normId(rawId as string);
    if (!id) {
      this.conflictMessage =
        'Could not read the dragged lesson (try again or use click-to-move).';
      this.cdr.detectChanges();
      return;
    }
    const slot = this.allSlots.find((s) => this.normId(s.id) === id);
    if (!slot) {
      this.conflictMessage =
        'That lesson is no longer on the grid — refresh the page or reload the timetable.';
      this.cdr.detectChanges();
      return;
    }
    this.applyMoveToCell(slot, rowId, day, period);
  }

  /** Validates and starts save; no-op if same cell or invalid. */
  private applyMoveToCell(slot: TimetableSlot, rowId: string, day: string, period: number): void {
    if (this.slotIsLocked(slot)) {
      this.conflictMessage = 'This lesson is locked. Unlock it before moving.';
      return;
    }

    if (this.viewKind === 'teacher' && this.normId(rowId) !== this.normId(slot.teacherId)) {
      this.conflictMessage =
        'Keep this lesson on the same teacher row — only change day or period (wall-chart style).';
      return;
    }
    if (this.viewKind === 'class' && this.normId(rowId) !== this.normId(slot.classId)) {
      this.conflictMessage =
        'Keep this lesson on the same class row — only change day or period.';
      return;
    }

    const nextTeacherId = this.viewKind === 'teacher' ? rowId : slot.teacherId;
    const nextClassId = this.viewKind === 'class' ? rowId : slot.classId;

    if (
      this.normId(slot.teacherId) === this.normId(nextTeacherId) &&
      this.normId(slot.classId) === this.normId(nextClassId) &&
      slot.dayOfWeek === day &&
      slot.periodNumber === period
    ) {
      return;
    }

    const otherTeacherSlot = this.allSlots.some(
      (s) =>
        this.normId(s.id) !== this.normId(slot.id) &&
        this.normId(s.teacherId) === this.normId(nextTeacherId) &&
        s.dayOfWeek === day &&
        s.periodNumber === period
    );
    if (otherTeacherSlot) {
      this.conflictMessage =
        'This teacher already has a lesson in that period — choose an empty slot or swap in two steps.';
      return;
    }

    const otherClassSlot = this.allSlots.some(
      (s) =>
        this.normId(s.id) !== this.normId(slot.id) &&
        this.normId(s.classId) === this.normId(nextClassId) &&
        s.dayOfWeek === day &&
        s.periodNumber === period
    );
    if (otherClassSlot) {
      this.conflictMessage =
        'This class already has a lesson in that period — choose an empty slot.';
      return;
    }

    this.persistMove(slot, nextTeacherId, nextClassId, day, period);
  }

  /** Autosave to API after every valid manual move (click-to-place or drag-drop). */
  private persistMove(
    slot: TimetableSlot,
    teacherId: string,
    classId: string,
    day: string,
    period: number
  ): void {
    if (this.saving) {
      return;
    }
    this.saving = true;
    this.conflictMessage = null;
    this.error = null;

    const prev = {
      teacherId: slot.teacherId,
      classId: slot.classId,
      dayOfWeek: slot.dayOfWeek,
      periodNumber: slot.periodNumber,
    };

    slot.teacherId = teacherId;
    slot.classId = classId;
    slot.dayOfWeek = day;
    slot.periodNumber = period;
    this.refreshGridLayout();
    this.cdr.detectChanges();

    this.timetableService
      .updateSlot(slot.id, {
        teacherId,
        classId,
        subjectId: slot.subjectId,
        dayOfWeek: day,
        periodNumber: period,
        room: slot.room,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.liftedSlotId = null;
          this.dragOverKey = null;
          this.success = 'Lesson saved in new slot.';
          this.refreshData();
          setTimeout(() => (this.success = null), 3500);
        },
        error: (err) => {
          this.saving = false;
          slot.teacherId = prev.teacherId;
          slot.classId = prev.classId;
          slot.dayOfWeek = prev.dayOfWeek;
          slot.periodNumber = prev.periodNumber;
          this.refreshGridLayout();
          const msg = err.error?.message || err.message || 'Could not save the move.';
          this.conflictMessage = msg;
          if (err.error?.conflicts?.length) {
            this.conflictMessage += ' (Server detected a timetable conflict.)';
          }
          this.cdr.detectChanges();
        },
      });
  }
}

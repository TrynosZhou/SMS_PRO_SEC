import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TeacherService } from '../../../services/teacher.service';
import { ClassService } from '../../../services/class.service';
import { TimetableService } from '../../../services/timetable.service';

export interface SubjectAssignmentRow {
  subjectId: string | null;
  subjectName: string;
  subjectCode: string | null;
  shortTitle: string | null;
  classId: string;
  className: string;
  classForm: string | null;
  lessonsPerWeek: number;
  placeholder?: boolean;
}

export interface AssignedClassRef {
  id: string;
  name: string;
  classForm: string | null;
}

@Component({
  selector: 'app-teacher-subject-contact',
  templateUrl: './teacher-subject-contact.component.html',
  styleUrls: ['./teacher-subject-contact.component.css'],
})
export class TeacherSubjectContactComponent implements OnInit {
  teacherId = '';
  teacher: {
    id: string;
    teacherId: string;
    firstName: string;
    lastName: string;
    shortName: string;
    qualification?: string | null;
  } | null = null;
  rows: SubjectAssignmentRow[] = [];
  assignedClasses: AssignedClassRef[] = [];
  totalWeeklyLessons = 0;
  loading = false;
  error = '';
  success = '';

  /** Route param or loaded teacher UUID — used for API calls. */
  get apiTeacherKey(): string {
    return this.teacher?.id || this.teacherId;
  }

  allClasses: Array<{ id: string; name: string; form?: string | null }> = [];
  loadingClasses = false;

  selectedRow: SubjectAssignmentRow | null = null;

  lessonModalOpen = false;
  lessonModalMode: 'new' | 'edit' = 'new';
  modalClassId = '';
  modalSubjectId = '';
  /** Lessons/week from active timetable config, keyed by subject id. */
  lessonsMap: Record<string, number> = {};
  /** Periods per week for the selected subject (writes to Timetable → Configuration). */
  modalLessonsPerWeek = 3;
  modalSubjects: Array<{ id: string; name: string }> = [];
  loadingModalSubjects = false;
  modalSaving = false;
  modalError = '';
  private editOriginal: { classId: string; subjectId: string } | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private teacherService: TeacherService,
    private classService: ClassService,
    private timetableService: TimetableService
  ) {}

  ngOnInit(): void {
    this.loadAllClasses();
    this.route.paramMap.subscribe((pm) => {
      const id = pm.get('teacherId') || '';
      if (!id) {
        this.error = 'Missing teacher.';
        return;
      }
      this.teacherId = id;
      this.selectedRow = null;
      this.load();
    });
  }

  loadAllClasses(): void {
    this.loadingClasses = true;
    this.classService.getClasses({ limit: 500 }).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.allClasses = this.classService.sortClasses(list);
        this.loadingClasses = false;
      },
      error: () => {
        this.allClasses = [];
        this.loadingClasses = false;
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.teacherService.getTeacherSubjectAssignment(this.teacherId).subscribe({
      next: (data) => {
        this.teacher = data?.teacher || null;
        this.rows = data?.rows || [];
        this.assignedClasses = data?.assignedClasses || [];
        this.totalWeeklyLessons = data?.totalWeeklyLessons ?? 0;
        this.loading = false;
        this.syncSelectedRowAfterLoad();
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.message || 'Failed to load assignment contract.';
        this.loading = false;
      },
    });
  }

  private syncSelectedRowAfterLoad(): void {
    if (!this.selectedRow || this.selectedRow.placeholder || !this.selectedRow.subjectId) {
      return;
    }
    const match = this.rows.find(
      (r) =>
        !r.placeholder &&
        r.subjectId === this.selectedRow!.subjectId &&
        r.classId === this.selectedRow!.classId
    );
    this.selectedRow = match || null;
  }

  back(): void {
    this.router.navigate(['/teachers/manage', 'teacher_subject']);
  }

  displayTeacherName(): string {
    if (!this.teacher) {
      return 'Teacher';
    }
    return `${this.teacher.firstName || ''} ${this.teacher.lastName || ''}`.trim();
  }

  subjectCell(r: SubjectAssignmentRow): string {
    if (r.placeholder || r.subjectId == null) {
      return '—';
    }
    const st = (r.shortTitle || '').trim();
    if (st) {
      return st;
    }
    const code = (r.subjectCode || '').trim();
    if (code) {
      return code;
    }
    return r.subjectName || '—';
  }

  classCell(r: SubjectAssignmentRow): string {
    let s = r.className || '—';
    if (r.classForm != null && String(r.classForm).trim() !== '') {
      s += ` (${String(r.classForm).trim()})`;
    }
    return s;
  }

  classChipLabel(c: AssignedClassRef): string {
    let s = c.name || '—';
    if (c.classForm != null && String(c.classForm).trim() !== '') {
      s += ` (${String(c.classForm).trim()})`;
    }
    return s;
  }

  rowTrackKey(r: SubjectAssignmentRow): string {
    return `${r.classId}|${r.subjectId ?? 'ph'}`;
  }

  isRowSelected(r: SubjectAssignmentRow): boolean {
    if (!this.selectedRow) {
      return false;
    }
    return this.rowTrackKey(r) === this.rowTrackKey(this.selectedRow);
  }

  selectContractRow(r: SubjectAssignmentRow, ev?: Event): void {
    ev?.stopPropagation();
    this.selectedRow = r;
  }

  canEditOrRemove(): boolean {
    return Boolean(this.selectedRow && !this.selectedRow.placeholder && this.selectedRow.subjectId);
  }

  openNewLesson(): void {
    this.lessonModalMode = 'new';
    this.editOriginal = null;
    this.modalClassId = '';
    this.modalSubjectId = '';
    this.modalSubjects = [];
    this.modalError = '';
    this.modalLessonsPerWeek = 3;
    this.timetableService.getConfig().subscribe({
      next: (c) => {
        this.lessonsMap = { ...(c.lessonsPerWeek || {}) };
        this.lessonModalOpen = true;
      },
      error: () => {
        this.lessonsMap = {};
        this.lessonModalOpen = true;
      },
    });
  }

  openEditLesson(): void {
    if (!this.canEditOrRemove() || !this.selectedRow?.subjectId) {
      return;
    }
    const row = this.selectedRow;
    const sid = row.subjectId as string;
    this.lessonModalMode = 'edit';
    this.editOriginal = {
      classId: row.classId,
      subjectId: sid,
    };
    this.modalClassId = row.classId;
    this.modalSubjectId = sid;
    this.modalLessonsPerWeek = row.lessonsPerWeek;
    this.modalError = '';
    this.timetableService.getConfig().subscribe({
      next: (c) => {
        this.lessonsMap = { ...(c.lessonsPerWeek || {}) };
        this.lessonModalOpen = true;
        this.loadSubjectsForModalClass(this.modalClassId);
      },
      error: () => {
        this.lessonsMap = {};
        this.lessonModalOpen = true;
        this.loadSubjectsForModalClass(this.modalClassId);
      },
    });
  }

  closeLessonModal(): void {
    this.lessonModalOpen = false;
    this.modalSaving = false;
    this.modalError = '';
    this.editOriginal = null;
  }

  onModalClassChange(): void {
    this.modalSubjectId = '';
    this.modalLessonsPerWeek = 3;
    this.loadSubjectsForModalClass(this.modalClassId);
  }

  onModalSubjectPicked(): void {
    if (!this.modalSubjectId) {
      return;
    }
    const v = this.lessonsMap[this.modalSubjectId];
    this.modalLessonsPerWeek = v != null && v >= 1 ? v : 3;
  }

  loadSubjectsForModalClass(classId: string): void {
    if (!classId) {
      this.modalSubjects = [];
      return;
    }
    this.loadingModalSubjects = true;
    this.classService.getClassById(classId).subscribe({
      next: (cls: any) => {
        const subs = (cls?.subjects || []) as Array<{ id: string; name: string }>;
        this.modalSubjects = [...subs].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        this.loadingModalSubjects = false;
        if (this.modalSubjectId && !this.modalSubjects.some((s) => s.id === this.modalSubjectId)) {
          this.modalSubjectId = '';
        }
      },
      error: () => {
        this.modalSubjects = [];
        this.loadingModalSubjects = false;
      },
    });
  }

  private mergeTimetableLessonsAndFinalize(successMessage: string): void {
    const sid = this.modalSubjectId;
    const n = Number(this.modalLessonsPerWeek);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      this.modalSaving = false;
      this.modalError = 'Enter periods per week between 1 and 50.';
      return;
    }
    this.timetableService.mergeSubjectLessonsInActiveConfig(sid, Math.round(n)).subscribe({
      next: () => {
        this.modalSaving = false;
        this.closeLessonModal();
        this.selectedRow = null;
        this.success =
          successMessage +
          ' The active timetable configuration (Timetable → Configuration) was updated for this subject.';
        this.load();
        setTimeout(() => (this.success = ''), 5500);
      },
      error: (err) => {
        this.modalSaving = false;
        this.modalError =
          err.error?.message ||
          'Could not save periods per week to timetable configuration. The lesson link may still have changed — open Timetable → Configuration to set periods.';
      },
    });
  }

  saveLesson(): void {
    const tid = this.apiTeacherKey;
    if (!tid) {
      this.modalError = 'Teacher not loaded.';
      return;
    }
    if (!this.modalClassId || !this.modalSubjectId) {
      this.modalError = 'Select a class and a subject.';
      return;
    }

    this.modalSaving = true;
    this.modalError = '';

    if (this.lessonModalMode === 'new') {
      this.teacherService.assignTeacherClassSubject(tid, this.modalClassId, this.modalSubjectId).subscribe({
        next: () => this.mergeTimetableLessonsAndFinalize('New lesson added.'),
        error: (err) => {
          this.modalSaving = false;
          this.modalError = err.error?.message || 'Could not add lesson.';
        },
      });
      return;
    }

    const old = this.editOriginal;
    if (!old) {
      this.modalSaving = false;
      return;
    }
    if (old.classId === this.modalClassId && old.subjectId === this.modalSubjectId) {
      this.mergeTimetableLessonsAndFinalize('Periods per week updated.');
      return;
    }

    this.teacherService.unassignTeacherClassSubject(tid, old.classId, old.subjectId).subscribe({
      next: () => {
        this.teacherService.assignTeacherClassSubject(tid, this.modalClassId, this.modalSubjectId).subscribe({
          next: () => this.mergeTimetableLessonsAndFinalize('Lesson updated.'),
          error: (err) => {
            this.modalSaving = false;
            this.modalError =
              err.error?.message ||
              'Previous lesson was removed but the new assignment failed. Add the lesson again with New lesson.';
            this.load();
          },
        });
      },
      error: (err) => {
        this.modalSaving = false;
        this.modalError = err.error?.message || 'Could not update lesson.';
      },
    });
  }

  removeLesson(): void {
    if (!this.canEditOrRemove() || !this.selectedRow?.subjectId) {
      return;
    }
    const r = this.selectedRow;
    const subj = this.subjectCell(r);
    const cls = this.classCell(r);
    if (
      !confirm(
        `Remove this lesson?\n\n${subj} — ${cls}\n\nThis removes the class–subject link from this teacher’s load.`
      )
    ) {
      return;
    }
    const tid = this.apiTeacherKey;
    if (!tid) {
      return;
    }
    this.loading = true;
    this.error = '';
    this.teacherService.unassignTeacherClassSubject(tid, r.classId, r.subjectId!).subscribe({
      next: () => {
        this.selectedRow = null;
        this.success = 'Lesson removed.';
        this.load();
        setTimeout(() => (this.success = ''), 4000);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || 'Could not remove lesson.';
      },
    });
  }
}

import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TeacherService } from '../../../services/teacher.service';

export interface SubjectAssignmentTeacherSummary {
  id: string;
  teacherId: string;
  firstName: string;
  lastName: string;
  shortName: string;
  weeklyLessons: number;
  assignmentCount: number;
  assignedClassCount?: number;
  isActive: boolean;
}

@Component({
  selector: 'app-teacher-subject-assignment',
  templateUrl: './teacher-subject-assignment.component.html',
  styleUrls: ['./teacher-subject-assignment.component.css'],
})
export class TeacherSubjectAssignmentComponent implements OnInit {
  teachers: SubjectAssignmentTeacherSummary[] = [];
  filtered: SubjectAssignmentTeacherSummary[] = [];
  loading = false;
  error = '';
  success = '';
  searchQuery = '';
  selectedId: string | null = null;
  actionBusy = false;

  constructor(
    private teacherService: TeacherService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.load();
  }

  get selectedTeacher(): SubjectAssignmentTeacherSummary | null {
    if (!this.selectedId) {
      return null;
    }
    return this.teachers.find((t) => t.id === this.selectedId) || null;
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.teacherService.getSubjectAssignmentSummary().subscribe({
      next: (res) => {
        this.teachers = res?.teachers || [];
        this.applySearch();
        if (this.selectedId && !this.teachers.some((t) => t.id === this.selectedId)) {
          this.selectedId = null;
        }
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.message || 'Failed to load teachers.';
        this.teachers = [];
        this.filtered = [];
        this.loading = false;
      },
    });
  }

  applySearch(): void {
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (!q) {
      this.filtered = [...this.teachers];
      return;
    }
    this.filtered = this.teachers.filter((t) => {
      const name = `${t.firstName} ${t.lastName}`.toLowerCase();
      return (
        name.includes(q) ||
        (t.teacherId || '').toLowerCase().includes(q) ||
        (t.shortName || '').toLowerCase().includes(q)
      );
    });
  }

  onSearchInput(): void {
    this.applySearch();
  }

  rowClass(t: SubjectAssignmentTeacherSummary): string {
    return this.selectedId === t.id ? 'tsa-row selected' : 'tsa-row';
  }

  selectRow(t: SubjectAssignmentTeacherSummary, ev?: Event): void {
    ev?.stopPropagation();
    this.selectedId = t.id;
  }

  openLessons(t: SubjectAssignmentTeacherSummary): void {
    this.router.navigate(['/teachers/manage', 'teacher_subject', 'contact', t.id]);
  }

  onNew(): void {
    this.router.navigate(['/teachers/manage', 'add-new']);
  }

  onEdit(): void {
    const t = this.selectedTeacher;
    if (!t?.id) {
      return;
    }
    this.router.navigate(['/teachers/manage', 'edit', t.id]);
  }

  onLessons(): void {
    const t = this.selectedTeacher;
    if (!t?.id) {
      return;
    }
    this.openLessons(t);
  }

  onRemove(): void {
    const t = this.selectedTeacher;
    if (!t?.id) {
      return;
    }
    const name = `${t.firstName || ''} ${t.lastName || ''}`.trim();
    if (
      !confirm(
        `Are you sure you want to delete teacher "${name}" (${t.teacherId})? This action cannot be undone.`
      )
    ) {
      return;
    }
    this.actionBusy = true;
    this.error = '';
    this.success = '';
    this.teacherService.deleteTeacher(t.id).subscribe({
      next: (data: any) => {
        this.success = data?.message || 'Teacher deleted successfully';
        this.selectedId = null;
        this.actionBusy = false;
        this.load();
        setTimeout(() => (this.success = ''), 5000);
      },
      error: (err: any) => {
        this.actionBusy = false;
        let msg = 'Failed to delete teacher';
        if (err.error?.message) {
          msg = err.error.message;
        } else if (typeof err.error === 'string') {
          msg = err.error;
        }
        this.error = msg;
      },
    });
  }

  displayName(t: SubjectAssignmentTeacherSummary): string {
    return `${t.firstName || ''} ${t.lastName || ''}`.trim();
  }

  actionsDisabled(): boolean {
    return !this.selectedTeacher || this.actionBusy || this.loading;
  }
}

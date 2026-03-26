import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { ParentService } from '../../../services/parent.service';
import { SettingsService } from '../../../services/settings.service';
import { StudentService } from '../../../services/student.service';

@Component({
  selector: 'app-student-dashboard',
  templateUrl: './student-dashboard.component.html',
  styleUrls: ['./student-dashboard.component.css']
})
export class StudentDashboardComponent implements OnInit, OnDestroy {
  /** Full name from API e.g. "Noble Zhou" */
  displayFullName = '';
  studentName = '';
  studentNumber = '';
  schoolName = '';
  profileLoading = true;
  error = '';

  /** When a parent is viewing a linked child’s dashboard */
  isParentViewer = false;
  contextStudentId: string | null = null;
  linkedStudents: any[] = [];

  daypartGreeting = '';
  clockTime = '';
  clockDate = '';
  private clockIntervalId: ReturnType<typeof setInterval> | null = null;
  private querySub: Subscription | null = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private settingsService: SettingsService,
    private studentService: StudentService,
    private parentService: ParentService
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.student) {
      const fn = (user.student.firstName || '').trim();
      const ln = (user.student.lastName || '').trim();
      this.studentName = [fn, ln].filter(Boolean).join(' ') || 'Student';
      this.studentNumber = user.student.studentNumber || '';
    } else {
      this.studentName = 'Student';
    }
  }

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.authService.logout();
      this.router.navigate(['/login']);
      return;
    }

    this.startClock();
    this.loadSchoolSettings();

    if (user.role === 'student') {
      this.initStudentViewer();
      return;
    }

    if (user.role === 'parent') {
      this.initParentViewer();
      return;
    }

    this.router.navigate(['/dashboard']);
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
    this.querySub = null;
    if (this.clockIntervalId !== null) {
      clearInterval(this.clockIntervalId);
      this.clockIntervalId = null;
    }
  }

  private loadSchoolSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        const row = Array.isArray(data) && data.length ? data[0] : data;
        this.schoolName = row?.schoolName || '';
      },
      error: () => {
        this.schoolName = '';
      }
    });
  }

  private initStudentViewer(): void {
    this.studentService.getCurrentStudent().subscribe({
      next: (s: any) => {
        const fn = (s?.firstName || '').trim();
        const ln = (s?.lastName || '').trim();
        this.displayFullName = (s?.fullName || `${fn} ${ln}`).trim() || this.studentName;
        if (s?.studentNumber) {
          this.studentNumber = s.studentNumber;
        }
        this.profileLoading = false;
      },
      error: () => {
        this.profileLoading = false;
      }
    });
  }

  private initParentViewer(): void {
    this.isParentViewer = true;
    this.parentService.getLinkedStudents().subscribe({
      next: (response: any) => {
        const list = response.students || [];
        this.linkedStudents = list;
        this.querySub = this.route.queryParams.subscribe((params) => {
          const sid = params['studentId'];
          this.applyParentStudentSelection(list, sid);
        });
      },
      error: () => {
        this.error = 'Could not load linked students.';
        this.profileLoading = false;
      }
    });
  }

  private applyParentStudentSelection(list: any[], studentIdFromQuery: string | undefined): void {
    if (!list.length) {
      this.error = 'No linked students. Add a child from Parent → Link Students first.';
      this.displayFullName = '';
      this.studentName = '';
      this.studentNumber = '';
      this.contextStudentId = null;
      this.profileLoading = false;
      return;
    }

    let chosen = studentIdFromQuery
      ? list.find((s) => String(s.id) === String(studentIdFromQuery))
      : null;
    if (!chosen) {
      chosen = list[0];
    }

    const needsUrlFix =
      !studentIdFromQuery || String(chosen.id) !== String(studentIdFromQuery);
    if (needsUrlFix) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { studentId: chosen.id },
        replaceUrl: true
      });
      return;
    }

    this.contextStudentId = chosen.id;
    const fn = (chosen.firstName || '').trim();
    const ln = (chosen.lastName || '').trim();
    this.displayFullName = `${fn} ${ln}`.trim() || 'Student';
    this.studentName = this.displayFullName;
    this.studentNumber = chosen.studentNumber || '';
    this.error = '';
    this.profileLoading = false;
  }

  onParentStudentChange(studentId: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { studentId },
      queryParamsHandling: 'merge'
    });
  }

  getDisplayName(): string {
    const fromApi = this.displayFullName?.trim();
    if (fromApi) {
      return fromApi;
    }
    return this.studentName?.trim() || 'Student';
  }

  private startClock(): void {
    this.tickClock();
    this.clockIntervalId = setInterval(() => this.tickClock(), 1000);
  }

  private tickClock(): void {
    const now = new Date();
    const h = now.getHours();
    if (h < 12) {
      this.daypartGreeting = 'Good morning';
    } else if (h < 17) {
      this.daypartGreeting = 'Good afternoon';
    } else {
      this.daypartGreeting = 'Good evening';
    }
    this.clockTime = now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    this.clockDate = now.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

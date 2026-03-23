import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
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

  daypartGreeting = '';
  clockTime = '';
  clockDate = '';
  private clockIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private settingsService: SettingsService,
    private studentService: StudentService
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
    if (!user || user.role !== 'student') {
      this.authService.logout();
      this.router.navigate(['/login']);
      return;
    }

    this.startClock();
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        const row = Array.isArray(data) && data.length ? data[0] : data;
        this.schoolName = row?.schoolName || '';
      },
      error: () => {
        this.schoolName = '';
      }
    });

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

  ngOnDestroy(): void {
    if (this.clockIntervalId !== null) {
      clearInterval(this.clockIntervalId);
      this.clockIntervalId = null;
    }
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

  getDisplayName(): string {
    const fromApi = this.displayFullName?.trim();
    if (fromApi) {
      return fromApi;
    }
    return this.studentName?.trim() || 'Student';
  }
}

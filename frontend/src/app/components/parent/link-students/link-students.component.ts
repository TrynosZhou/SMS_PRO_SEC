import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-link-students',
  templateUrl: './link-students.component.html',
  styleUrls: ['./link-students.component.css']
})
export class LinkStudentsComponent implements OnInit {
  studentId = '';
  linkedStudents: any[] = [];
  linking = false;
  loading = false;
  error = '';
  success = '';

  constructor(
    private parentService: ParentService,
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit() {
    this.loadLinkedStudents();
  }

  loadLinkedStudents() {
    this.loading = true;
    this.parentService.getLinkedStudents().subscribe({
      next: (response: any) => {
        this.linkedStudents = response.students || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to load linked students';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  linkStudent() {
    // Reset messages
    this.error = '';
    this.success = '';

    // Validate inputs
    if (!this.studentId || !this.studentId.trim()) {
      this.error = 'Please enter a Student ID';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.linking = true;

    this.parentService.linkStudentByIdAndDob(this.studentId.trim()).subscribe({
      next: (response: any) => {
        this.linking = false;
        this.success = `Successfully linked ${response.student?.firstName || ''} ${response.student?.lastName || ''}`;
        // Clear form
        this.studentId = '';
        // Reload linked students
        this.loadLinkedStudents();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.linking = false;
        this.error = err.error?.message || 'Failed to link student. Please verify the Student ID and Date of Birth.';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  unlinkStudent(studentId: string) {
    if (!confirm('Are you sure you want to unlink this student?')) {
      return;
    }

    this.parentService.unlinkStudent(studentId).subscribe({
      next: () => {
        this.success = 'Student unlinked successfully';
        this.loadLinkedStudents();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to unlink student';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  goToDashboard() {
    this.router.navigate(['/parent/dashboard']);
  }
}

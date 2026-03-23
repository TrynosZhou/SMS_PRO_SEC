import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { EtaskService, ETaskDto, ETaskSubmissionDto } from '../../../services/etask.service';

@Component({
  selector: 'app-student-elearning-tasks',
  templateUrl: './student-elearning-tasks.component.html',
  styleUrls: ['./student-elearning-tasks.component.css']
})
export class StudentElearningTasksComponent implements OnInit {
  tasks: ETaskDto[] = [];
  /** Latest submission per task id */
  submissionByTaskId: Record<string, ETaskSubmissionDto> = {};
  loading = true;
  error = '';
  uploadingTaskId: string | null = null;
  uploadError: Record<string, string> = {};

  constructor(
    private etaskService: EtaskService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (!user || String(user.role).toLowerCase() !== 'student') {
      this.router.navigate(['/dashboard']);
      return;
    }
    forkJoin({
      tasks: this.etaskService.listStudentTasks(),
      subs: this.etaskService.listStudentMySubmissions()
    }).subscribe({
      next: ({ tasks, subs }) => {
        this.tasks = Array.isArray(tasks) ? tasks : [];
        const list = Array.isArray(subs) ? subs : [];
        this.submissionByTaskId = {};
        for (const s of list) {
          if (s.eTaskId && !this.submissionByTaskId[s.eTaskId]) {
            this.submissionByTaskId[s.eTaskId] = s;
          }
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Could not load tasks.';
        this.loading = false;
      }
    });
  }

  linkFor(t: ETaskDto): string | null {
    return EtaskService.resolveUploadUrl(t.attachmentUrl);
  }

  linkForMySubmission(taskId: string): string | null {
    const s = this.submissionByTaskId[taskId];
    if (!s?.fileUrl) {
      return null;
    }
    return EtaskService.resolveUploadUrl(s.fileUrl);
  }

  onFileSelected(taskId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.uploadError[taskId] = '';
    this.uploadingTaskId = taskId;
    this.etaskService.submitStudentTask(taskId, file).subscribe({
      next: (res) => {
        this.uploadingTaskId = null;
        if (res?.submission) {
          this.submissionByTaskId[taskId] = res.submission;
        }
      },
      error: (err) => {
        this.uploadingTaskId = null;
        this.uploadError[taskId] = err?.error?.message || 'Upload failed.';
      }
    });
  }
}

import { Component, OnInit } from '@angular/core';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-mark-input-progress',
  templateUrl: './mark-input-progress.component.html',
  styleUrls: ['./mark-input-progress.component.css']
})
export class MarkInputProgressComponent implements OnInit {
  classes: any[] = [];
  subjects: any[] = [];
  exams: any[] = [];
  
  selectedExamId = '';
  selectedSubjectId = '';
  selectedSubjectCode = '';
  selectedTerm = '';
  selectedExamType = '';
  
  progressData: any = null;
  loading = false;
  error = '';

  // Modern UI state
  viewMode: 'cards' | 'table' = 'cards';
  classSearch = '';
  autoLoadProgress = false;
  lastLoadedAt: number | null = null;
  
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End Term' }
  ];
  
  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private settingsService: SettingsService
  ) { }

  ngOnInit() {
    this.loadSettings();
    this.loadClasses();
    this.loadSubjects();
    this.loadExams();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings) {
          // Use activeTerm from settings, or fallback to currentTerm
          this.selectedTerm = settings.activeTerm || settings.currentTerm || '';
        }
      },
      error: (error) => {
        console.error('Error loading settings:', error);
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe(
      (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        const activeClasses = classesList.filter((c: any) => c.isActive);
        this.classes = this.classService.sortClasses(activeClasses);
      },
      (error: any) => {
        console.error('Error loading classes:', error);
        this.error = 'Failed to load classes';
      }
    );
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe(
      (data: any) => {
        // Filter active subjects and ensure code is included
        this.subjects = data.filter((s: any) => s.isActive).map((s: any) => ({
          ...s,
          displayName: s.code ? `${s.code} - ${s.name}` : s.name
        }));
      },
      (error: any) => {
        console.error('Error loading subjects:', error);
        this.error = 'Failed to load subjects';
      }
    );
  }

  onSubjectChange() {
    // Sync subject code when subject is selected by name
    const selectedSubject = this.subjects.find(s => s.id === this.selectedSubjectId);
    if (selectedSubject) {
      this.selectedSubjectCode = selectedSubject.code || '';
    } else {
      this.selectedSubjectCode = '';
    }
  }

  onSubjectCodeChange() {
    // Sync subject ID when subject is selected by code
    const selectedSubject = this.subjects.find(s => s.code === this.selectedSubjectCode);
    if (selectedSubject) {
      this.selectedSubjectId = selectedSubject.id;
    } else {
      this.selectedSubjectId = '';
    }
  }

  loadExams() {
    this.examService.getExams().subscribe(
      (data: any) => {
        this.exams = data;
        // Extract unique terms
        const terms = new Set(data.map((e: any) => e.term).filter((t: any) => t));
        // You can use this for term selection if needed
      },
      (error: any) => {
        console.error('Error loading exams:', error);
      }
    );
  }

  loadProgress() {
    this.loading = true;
    this.error = '';
    this.progressData = null;

    this.examService.getMarkInputProgress(
      this.selectedExamId || undefined,
      this.selectedSubjectId || undefined,
      this.selectedTerm || undefined,
      this.selectedExamType || undefined
    ).subscribe(
      (data: any) => {
        this.progressData = data;
        this.lastLoadedAt = Date.now();
        this.loading = false;
      },
      (error: any) => {
        console.error('Error loading progress:', error);
        this.error = error.error?.message || 'Failed to load progress data';
        this.loading = false;
      }
    );
  }

  get filteredProgress(): any[] {
    const progress = this.progressData?.progress;
    if (!Array.isArray(progress)) return [];

    const q = this.classSearch.trim().toLowerCase();
    if (!q) return progress;

    // Filter classes inside each stream, then remove empty streams
    return progress
      .map((stream: any) => {
        const filteredClasses = (stream.classes || []).filter((c: any) =>
          String(c?.className || '').toLowerCase().includes(q)
        );

        // Recompute stream-level totals from the filtered classes
        const streamTotal = (filteredClasses || []).reduce(
          (sum: number, c: any) => sum + Number(c?.totalStudents || 0),
          0
        );
        const streamWithMarks = (filteredClasses || []).reduce(
          (sum: number, c: any) => sum + Number(c?.studentsWithMarks || 0),
          0
        );
        const streamCompletionPercentage =
          streamTotal > 0 ? parseFloat(((streamWithMarks / streamTotal) * 100).toFixed(2)) : 0;

        return {
          ...stream,
          classes: filteredClasses,
          streamTotal,
          streamWithMarks,
          streamCompletionPercentage
        };
      })
      .filter((s: any) => (s.classes || []).length > 0);
  }

  get overallStats(): { totalStudents: number; withMarks: number; completion: number; streams: number } {
    const streams = this.filteredProgress;
    let totalStudents = 0;
    let withMarks = 0;

    for (const stream of streams) {
      for (const cls of stream.classes || []) {
        totalStudents += Number(cls?.totalStudents || 0);
        withMarks += Number(cls?.studentsWithMarks || 0);
      }
    }

    const completion = totalStudents > 0 ? Math.round((withMarks / totalStudents) * 1000) / 10 : 0;
    return {
      totalStudents,
      withMarks,
      completion,
      streams: streams.length
    };
  }

  resetFilters() {
    this.selectedExamId = '';
    this.selectedSubjectId = '';
    this.selectedSubjectCode = '';
    this.selectedExamType = '';
    this.classSearch = '';
    this.viewMode = 'cards';
    this.autoLoadProgress = false;
    // Reload term from settings when resetting
    this.loadSettings();
    this.progressData = null;
  }

  getProgressColor(percentage: number): string {
    if (percentage >= 80) return '#28a745';
    if (percentage >= 50) return '#ffc107';
    if (percentage >= 25) return '#fd7e14';
    return '#dc3545';
  }

  getProgressWidth(percentage: number): string {
    return `${Math.min(100, Math.max(0, percentage))}%`;
  }

  onAnyFilterChange() {
    if (this.autoLoadProgress) {
      this.loadProgress();
    }
  }

  getCompletionStatus(percentage: number): { label: string; cls: string } {
    // Keep aligned with getProgressColor() thresholds: >=80, >=50, >=25
    if (percentage >= 80) return { label: 'On Track (80+)', cls: 'status-completed' };
    if (percentage >= 50) return { label: 'Almost Done (50+)', cls: 'status-almost' };
    if (percentage >= 25) return { label: 'In Progress (25+)', cls: 'status-progress' };
    if (percentage > 0) return { label: 'Started', cls: 'status-started' };
    return { label: 'Not Started', cls: 'status-not-started' };
  }
}


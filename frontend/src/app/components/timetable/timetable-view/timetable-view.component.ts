import { Component, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  TimetableService,
  TimetableVersion,
  TimetableSlot,
  TimetableConfig,
} from '../../../services/timetable.service';
import { TeacherService } from '../../../services/teacher.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { SettingsService } from '../../../services/settings.service';

/** One column in the teacher preview grid (period or break), matching PDF layout. */
export type TimetablePreviewColumn =
  | { kind: 'period'; period: number; timeStart: string; timeEnd: string }
  | { kind: 'break'; label: string; timeStart: string; timeEnd: string };

/** Landscape-style teacher sheet (days = rows, periods = columns). */
export interface TimetableTeacherPreviewSheet {
  teacherId: string;
  teacherName: string;
  schoolName: string;
  versionTitle: string;
  schoolLogo: string | null;
  daysOfWeek: string[];
  columns: TimetablePreviewColumn[];
  cells: Record<string, TimetableSlot[]>;
  generatedAtLabel: string;
}

/** Same grid layout as teacher preview, one sheet per class. */
export interface TimetableClassPreviewSheet {
  classId: string;
  className: string;
  classTeacherLabel: string | null;
  schoolName: string;
  versionTitle: string;
  schoolLogo: string | null;
  daysOfWeek: string[];
  columns: TimetablePreviewColumn[];
  cells: Record<string, TimetableSlot[]>;
  generatedAtLabel: string;
}

/** One row segment for class preview body (break column, empty period, or merged lesson). */
export type ClassPreviewDaySegment =
  | { kind: 'break'; label: string; timeStart: string; timeEnd: string }
  | { kind: 'empty'; colspan: number }
  | { kind: 'lesson'; colspan: number; slots: TimetableSlot[] };

/**
 * Matches consolidated PDF: each teacher row × (per day: same period/break strip as single-day timetables).
 * Cells show class name for that teacher / day / period.
 */
export interface TimetableConsolidatedPreviewSheet {
  versionTitle: string;
  schoolLogo: string | null;
  generatedAtLabel: string;
  daysOfWeek: string[];
  dayStripColumns: TimetablePreviewColumn[];
  teachers: { teacherId: string; teacherName: string }[];
  cellMap: Record<string, TimetableSlot>;
}

@Component({
  selector: 'app-timetable-view',
  templateUrl: './timetable-view.component.html',
  styleUrls: ['./timetable-view.component.css']
})
export class TimetableViewComponent implements OnInit {
  versions: TimetableVersion[] = [];
  selectedVersion: TimetableVersion | null = null;
  slots: TimetableSlot[] = [];
  teachers: any[] = [];
  classes: any[] = [];
  subjects: any[] = [];

  viewMode: 'class' | 'teacher' | 'all' = 'all';
  selectedTeacherId: string = '';
  selectedClassId: string = '';

  daysOfWeek: string[] = [];
  periods: number[] = [];
  timetableGrid: Map<string, TimetableSlot[]> = new Map();

  loading = false;
  generating = false;
  generationProgress = 0;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  private generationProgressInterval: any = null;
  private generationStartedAt = 0;
  /** Minimum time (ms) the generation UI stays visible on success — easier to notice the progress bar. */
  private readonly generationMinVisibleMs = 4000;

  // Generation form
  newVersionName = '';
  newVersionDescription = '';

  // Edit mode
  editingSlot: TimetableSlot | null = null;
  editForm: any = {};

  /** Full-version preview (teachers / classes / summary) */
  previewModalOpen = false;
  previewLoading = false;
  previewError: string | null = null;
  previewVersionLabel = '';
  previewTab: 'teachers' | 'classes' | 'summary' = 'teachers';
  previewTeacherSheets: TimetableTeacherPreviewSheet[] = [];
  previewClassSheets: TimetableClassPreviewSheet[] = [];
  /** Version id used for preview + PDF downloads while the preview modal is open. */
  previewVersionId: string | null = null;
  previewConsolidatedSheet: TimetableConsolidatedPreviewSheet | null = null;

  private readonly dayOrder = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  constructor(
    private timetableService: TimetableService,
    private teacherService: TeacherService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    this.loadVersions();
    this.loadTeachers();
    this.loadClasses();
    this.loadSubjects();
  }

  loadVersions(): void {
    this.loading = true;
    this.timetableService.getVersions().subscribe({
      next: (versions) => {
        this.versions = versions;
        if (versions.length > 0 && !this.selectedVersion) {
          const activeVersion = versions.find(v => v.isActive) || versions[0];
          this.selectVersion(activeVersion.id);
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading versions:', err);
        this.error = 'Failed to load timetable versions';
        this.loading = false;
      }
    });
  }

  loadTeachers(): void {
    this.teacherService.getTeachers().subscribe({
      next: (teachers) => {
        this.teachers = teachers;
      },
      error: (err) => {
        console.error('Error loading teachers:', err);
      }
    });
  }

  loadClasses(): void {
    this.classService.getClasses().subscribe({
      next: (classes) => {
        const classesList = Array.isArray(classes) ? classes : (classes?.data || []);
        this.classes = this.classService.sortClasses(classesList);
      },
      error: (err) => {
        console.error('Error loading classes:', err);
      }
    });
  }

  loadSubjects(): void {
    this.subjectService.getSubjects().subscribe({
      next: (subjects) => {
        this.subjects = subjects;
      },
      error: (err) => {
        console.error('Error loading subjects:', err);
      }
    });
  }

  selectVersion(versionId: string): void {
    this.selectedVersion = this.versions.find(v => v.id === versionId) || null;
    if (this.selectedVersion) {
      this.loadSlots();
    }
  }

  loadSlots(): void {
    if (!this.selectedVersion) return;

    this.loading = true;
    const teacherId: string | undefined = (this.viewMode === 'teacher' && this.selectedTeacherId && this.selectedTeacherId !== '') 
      ? this.selectedTeacherId 
      : undefined;
    const classId: string | undefined = (this.viewMode === 'class' && this.selectedClassId && this.selectedClassId !== '') 
      ? this.selectedClassId 
      : undefined;

    this.timetableService.getSlots(this.selectedVersion.id, teacherId, classId).subscribe({
      next: (slots) => {
        this.slots = slots;
        this.buildTimetableGrid();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading slots:', err);
        this.error = 'Failed to load timetable slots';
        this.loading = false;
      }
    });
  }

  buildTimetableGrid(): void {
    this.timetableGrid.clear();
    
    // Extract unique days and periods
    const daysSet = new Set<string>();
    const periodsSet = new Set<number>();
    
    this.slots.forEach(slot => {
      if (!slot.isBreak) {
        daysSet.add(slot.dayOfWeek);
        periodsSet.add(slot.periodNumber);
      }
    });

    this.daysOfWeek = Array.from(daysSet).sort();
    this.periods = Array.from(periodsSet).sort((a, b) => a - b);

    // Build grid map
    this.slots.forEach(slot => {
      if (!slot.isBreak) {
        const key = `${slot.dayOfWeek}-${slot.periodNumber}`;
        if (!this.timetableGrid.has(key)) {
          this.timetableGrid.set(key, []);
        }
        this.timetableGrid.get(key)!.push(slot);
      }
    });
  }

  getSlot(day: string, period: number): TimetableSlot[] {
    const key = `${day}-${period}`;
    return this.timetableGrid.get(key) || [];
  }

  isSlotBeingEdited(slot: TimetableSlot): boolean {
    return this.editingSlot !== null && this.editingSlot.id === slot.id;
  }

  isCellBeingEdited(day: string, period: number): boolean {
    if (!this.editingSlot) return false;
    const slots = this.getSlot(day, period);
    return slots.some(s => s.id === this.editingSlot!.id);
  }

  isVersionSelected(versionId: string): boolean {
    return this.selectedVersion?.id === versionId;
  }

  generateTimetable(): void {
    if (!this.newVersionName.trim()) {
      this.error = 'Please enter a version name';
      return;
    }

    this.generating = true;
    this.generationStartedAt = Date.now();
    this.startGenerationProgress();
    this.error = null;
    this.success = null;

    this.timetableService.generateTimetable(this.newVersionName, this.newVersionDescription).subscribe({
      next: (response) => {
        this.success = `Timetable generated successfully! ${response.stats.totalSlots} slots created.`;
        this.newVersionName = '';
        this.newVersionDescription = '';
        this.loadVersions();
        this.finishGenerationProgress(true);
        const elapsed = Date.now() - this.generationStartedAt;
        const waitMore = Math.max(0, this.generationMinVisibleMs - elapsed);
        setTimeout(() => {
          this.generating = false;
          this.generationProgress = 0;
        }, waitMore);
        setTimeout(() => {
          this.success = null;
        }, 5000);
      },
      error: (err) => {
        console.error('Error generating timetable:', err);
        
        // Build detailed error message with diagnostics
        let errorMessage = err.error?.message || 'Failed to generate timetable';
        
        if (err.error?.diagnostics) {
          const diagnostics = err.error.diagnostics;
          errorMessage += '\n\n';
          
          if (diagnostics.issues && diagnostics.issues.length > 0) {
            errorMessage += 'Issues found:\n';
            diagnostics.issues.forEach((issue: string) => {
              errorMessage += `• ${issue}\n`;
            });
            errorMessage += '\n';
          }
          
          if (err.error?.help && err.error.help.length > 0) {
            errorMessage += 'How to fix:\n';
            err.error.help.forEach((help: string) => {
              errorMessage += `${help}\n`;
            });
          }
          
          // Add summary
          if (diagnostics.teachers) {
            const teachersWithoutClasses = diagnostics.teachers.filter((t: any) => t.classesCount === 0).length;
            const teachersWithoutSubjects = diagnostics.teachers.filter((t: any) => t.subjectsCount === 0).length;
            const classesWithoutSubjects = diagnostics.classes.filter((c: any) => c.subjectsCount === 0).length;
            
            errorMessage += '\nSummary:\n';
            if (teachersWithoutClasses > 0) {
              errorMessage += `• ${teachersWithoutClasses} teacher(s) need classes assigned\n`;
            }
            if (teachersWithoutSubjects > 0) {
              errorMessage += `• ${teachersWithoutSubjects} teacher(s) need subjects assigned\n`;
            }
            if (classesWithoutSubjects > 0) {
              errorMessage += `• ${classesWithoutSubjects} class(es) need subjects assigned\n`;
            }
          }
        }
        
        this.error = errorMessage;
        this.generating = false;
        this.finishGenerationProgress(false);
      }
    });
  }

  private startGenerationProgress(): void {
    // Backend generation doesn't stream progress; show a smooth, simulated progress
    // that completes when the request returns.
    this.generationProgress = 0;

    if (this.generationProgressInterval) {
      clearInterval(this.generationProgressInterval);
    }

    let p = 0;
    this.generationProgress = p;

    this.generationProgressInterval = setInterval(() => {
      // Slower ticks (~+4s feel vs 450ms): easier to see the bar moving while the API runs.
      const step = Math.max(1, Math.floor(Math.random() * 4)); // 1..3
      p = Math.min(92, p + step);
      this.generationProgress = p;
    }, 1450);
  }

  private finishGenerationProgress(markComplete: boolean): void {
    if (this.generationProgressInterval) {
      clearInterval(this.generationProgressInterval);
      this.generationProgressInterval = null;
    }

    if (markComplete) {
      this.generationProgress = 100;
    } else {
      // If it failed, bring it down quickly so it doesn't look like success.
      this.generationProgress = Math.max(0, this.generationProgress - 30);
    }

    if (!markComplete) {
      setTimeout(() => {
        this.generationProgress = 0;
      }, 800);
    }
  }

  activateVersion(versionId: string): void {
    this.timetableService.activateVersion(versionId).subscribe({
      next: () => {
        this.success = 'Timetable version activated successfully';
        this.loadVersions();
        // Auto-select the activated version
        this.selectVersion(versionId);
        setTimeout(() => {
          this.success = null;
        }, 3000);
      },
      error: (err) => {
        console.error('Error activating version:', err);
        this.error = err.error?.message || 'Failed to activate timetable version';
      }
    });
  }

  editSlot(slot: TimetableSlot): void {
    this.editingSlot = { ...slot };
    this.editForm = {
      teacherId: slot.teacherId,
      classId: slot.classId,
      subjectId: slot.subjectId,
      dayOfWeek: slot.dayOfWeek,
      periodNumber: slot.periodNumber,
      room: slot.room || ''
    };
  }

  cancelEdit(): void {
    this.editingSlot = null;
    this.editForm = {};
  }

  saveSlot(): void {
    if (!this.editingSlot) return;

    this.saving = true;
    this.timetableService.updateSlot(this.editingSlot.id, this.editForm).subscribe({
      next: () => {
        this.success = 'Timetable slot updated successfully';
        this.cancelEdit();
        this.loadSlots();
        this.saving = false;
        setTimeout(() => {
          this.success = null;
        }, 3000);
      },
      error: (err) => {
        console.error('Error updating slot:', err);
        this.error = err.error?.message || 'Failed to update timetable slot';
        if (err.error?.conflicts) {
          this.error += ' Conflicts detected.';
        }
        this.saving = false;
      }
    });
  }

  deleteSlot(slotId: string): void {
    if (!confirm('Are you sure you want to delete this timetable slot?')) {
      return;
    }

    this.timetableService.deleteSlot(slotId).subscribe({
      next: () => {
        this.success = 'Timetable slot deleted successfully';
        this.loadSlots();
        setTimeout(() => {
          this.success = null;
        }, 3000);
      },
      error: (err) => {
        console.error('Error deleting slot:', err);
        this.error = 'Failed to delete timetable slot';
      }
    });
  }

  /** Resolves which timetable version to use for PDFs (explicit arg, preview context, or main selection). */
  private resolvePdfVersionId(explicit?: string): string | null {
    return explicit ?? this.previewVersionId ?? this.selectedVersion?.id ?? null;
  }

  downloadTeacherPDF(teacherId: string, versionId?: string): void {
    const vid = this.resolvePdfVersionId(versionId);
    if (!vid) {
      this.error = 'Please select a timetable version first';
      return;
    }

    this.timetableService.downloadTeacherTimetablePDF(vid, teacherId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `teacher-timetable-${teacherId}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Error downloading PDF:', err);
        this.error = 'Failed to download teacher timetable PDF';
      }
    });
  }

  downloadClassPDF(classId: string, versionId?: string): void {
    const vid = this.resolvePdfVersionId(versionId);
    if (!vid) {
      this.error = 'Please select a timetable version first';
      return;
    }

    this.timetableService.downloadClassTimetablePDF(vid, classId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `class-timetable-${classId}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Error downloading PDF:', err);
        this.error = 'Failed to download class timetable PDF';
      }
    });
  }

  downloadConsolidatedPDF(versionId?: string): void {
    const targetVersionId = this.resolvePdfVersionId(versionId);
    if (!targetVersionId) {
      this.error = 'Please select a timetable version first';
      return;
    }

    this.timetableService.downloadConsolidatedTimetablePDF(targetVersionId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `consolidated-timetable-${targetVersionId}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.success = 'PDF downloaded successfully';
        setTimeout(() => {
          this.success = null;
        }, 3000);
      },
      error: (err) => {
        console.error('Error downloading PDF:', err);
        this.error = err.error?.message || 'Failed to download consolidated timetable PDF';
      }
    });
  }

  onViewModeChange(): void {
    this.loadSlots();
  }

  clearError(): void {
    this.error = null;
  }

  clearSuccess(): void {
    this.success = null;
  }

  openTimetablePreview(versionId?: string): void {
    const vid = versionId ?? this.selectedVersion?.id;
    if (!vid) {
      this.error = 'Please select a timetable version first';
      return;
    }

    const version = this.versions.find((v) => v.id === vid);
    this.previewVersionLabel = version?.name ?? 'Timetable';
    this.previewModalOpen = true;
    this.previewLoading = true;
    this.previewError = null;
    this.previewTab = 'teachers';
    this.previewVersionId = vid;
    this.previewTeacherSheets = [];
    this.previewClassSheets = [];
    this.previewConsolidatedSheet = null;

    forkJoin({
      slots: this.timetableService.getSlots(vid),
      config: this.timetableService
        .getConfig()
        .pipe(catchError(() => of(null as TimetableConfig | null))),
      settings: this.settingsService.getSettings().pipe(catchError(() => of({}))),
    }).subscribe({
      next: ({ slots, config, settings }) => {
        const teaching = slots.filter((s) => !s.isBreak);
        if (teaching.length === 0) {
          this.previewError = 'No timetable slots to preview for this version.';
          this.previewLoading = false;
          return;
        }

        const { schoolName, schoolLogo } = this.extractSchoolBranding(settings);
        const versionTitle = `${schoolName}: ${this.previewVersionLabel}`;

        this.previewTeacherSheets = this.buildTeacherPreviewSheets(
          teaching,
          config,
          schoolName,
          versionTitle,
          schoolLogo
        );
        this.previewClassSheets = this.buildClassPreviewSheets(
          teaching,
          config,
          schoolName,
          versionTitle,
          schoolLogo
        );
        this.previewConsolidatedSheet = this.buildConsolidatedPreviewSheet(
          teaching,
          config,
          versionTitle,
          schoolLogo
        );
        this.previewLoading = false;
      },
      error: (err) => {
        console.error('Error loading preview slots:', err);
        this.previewError =
          err.error?.message || 'Failed to load timetable data for preview';
        this.previewLoading = false;
      },
    });
  }

  closeTimetablePreview(): void {
    this.previewModalOpen = false;
    this.previewError = null;
    this.previewVersionId = null;
    this.previewTeacherSheets = [];
    this.previewClassSheets = [];
    this.previewConsolidatedSheet = null;
  }

  setPreviewTab(tab: 'teachers' | 'classes' | 'summary'): void {
    this.previewTab = tab;
  }

  /** Cell lookup for teacher sheet (day + period only; break columns have no lesson cells). */
  getTeacherSheetCell(
    sheet: TimetableTeacherPreviewSheet,
    day: string,
    period: number
  ): TimetableSlot[] {
    return this.getPreviewSheetCells(sheet, day, period);
  }

  getClassSheetCell(
    sheet: TimetableClassPreviewSheet,
    day: string,
    period: number
  ): TimetableSlot[] {
    return this.getPreviewSheetCells(sheet, day, period);
  }

  private getPreviewSheetCells(
    sheet: { cells: Record<string, TimetableSlot[]> },
    day: string,
    period: number
  ): TimetableSlot[] {
    return sheet.cells[`${day}-${period}`] || [];
  }

  /** Row segments for one class sheet row (merged consecutive periods with the same lesson). */
  getClassDaySegments(sheet: TimetableClassPreviewSheet, day: string): ClassPreviewDaySegment[] {
    const out: ClassPreviewDaySegment[] = [];
    const cols = sheet.columns;
    let i = 0;
    while (i < cols.length) {
      const col = cols[i];
      if (col.kind === 'break') {
        out.push({
          kind: 'break',
          label: col.label,
          timeStart: col.timeStart,
          timeEnd: col.timeEnd,
        });
        i++;
        continue;
      }
      const period = col.period;
      const slots = this.getClassSheetCell(sheet, day, period);
      if (!slots.length) {
        out.push({ kind: 'empty', colspan: 1 });
        i++;
        continue;
      }
      const first = slots[0];
      let colspan = 1;
      let j = i + 1;
      while (j < cols.length) {
        const nextCol = cols[j];
        if (nextCol.kind !== 'period') {
          break;
        }
        const nextSlots = this.getClassSheetCell(sheet, day, nextCol.period);
        if (!nextSlots.length || !this.isSameTimetableLesson(first, nextSlots[0])) {
          break;
        }
        colspan++;
        j++;
      }
      out.push({ kind: 'lesson', colspan, slots });
      i = j;
    }
    return out;
  }

  private isSameTimetableLesson(a: TimetableSlot, b: TimetableSlot): boolean {
    return (
      a.subjectId === b.subjectId &&
      a.teacherId === b.teacherId &&
      a.classId === b.classId
    );
  }

  teacherDisplayName(slot: TimetableSlot): string {
    const t = slot.teacher;
    if (!t) {
      return '—';
    }
    const name = `${t.firstName || ''} ${t.lastName || ''}`.trim();
    return name || '—';
  }

  /** Class name shown in consolidated summary cells (same idea as PDF). */
  getConsolidatedCellLabel(
    sheet: TimetableConsolidatedPreviewSheet,
    teacherId: string,
    day: string,
    col: TimetablePreviewColumn
  ): string {
    if (col.kind !== 'period') {
      return '';
    }
    const k = `${teacherId}|${day}|${col.period}`;
    const slot = sheet.cellMap[k];
    const name = slot?.class?.name?.trim();
    return name || '';
  }

  classFormCornerLabel(slot: TimetableSlot): string | null {
    const form = slot.class?.form;
    if (form != null && String(form).trim() !== '') {
      return String(form).trim();
    }
    return null;
  }

  dayShortLabel(fullDay: string): string {
    const map: Record<string, string> = {
      Monday: 'Mon',
      Tuesday: 'Tue',
      Wednesday: 'Wed',
      Thursday: 'Thu',
      Friday: 'Fri',
      Saturday: 'Sat',
      Sunday: 'Sun',
    };
    return map[fullDay] || fullDay.slice(0, 3);
  }

  subjectAbbrev(slot: TimetableSlot): string {
    const code = slot.subject?.code?.trim();
    if (code) return code.length > 6 ? code.slice(0, 6) : code;
    const name = slot.subject?.name?.trim() || '—';
    return name.length > 4 ? name.slice(0, 4) : name;
  }

  isPeriodColumn(col: TimetablePreviewColumn): col is Extract<TimetablePreviewColumn, { kind: 'period' }> {
    return col.kind === 'period';
  }

  isBreakColumn(col: TimetablePreviewColumn): col is Extract<TimetablePreviewColumn, { kind: 'break' }> {
    return col.kind === 'break';
  }

  private sortDays(days: string[]): string[] {
    return [...new Set(days)].sort(
      (a, b) =>
        this.dayOrder.indexOf(a) - this.dayOrder.indexOf(b) ||
        a.localeCompare(b)
    );
  }

  private extractSchoolBranding(settings: any): {
    schoolName: string;
    schoolLogo: string | null;
  } {
    let data = settings;
    if (Array.isArray(settings) && settings.length > 0) {
      data = settings[0];
    }
    const schoolName = (data?.schoolName || 'School').trim();
    let schoolLogo: string | null = null;
    const logo = data?.schoolLogo || data?.schoolLogo2;
    if (typeof logo === 'string' && logo.length > 0) {
      if (logo.startsWith('data:image')) {
        schoolLogo = logo;
      } else if (logo.startsWith('http://') || logo.startsWith('https://')) {
        schoolLogo = logo;
      } else if (logo.length > 100) {
        schoolLogo = `data:image/png;base64,${logo}`;
      }
    }
    return { schoolName, schoolLogo };
  }

  private parseTimeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  private formatMinutesAsTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  private calculateTimeSlotsFromConfig(
    config: TimetableConfig
  ): Array<{ startTime: string; endTime: string }> {
    const out: Array<{ startTime: string; endTime: string }> = [];
    const startMinutes = this.parseTimeToMinutes(config.schoolStartTime);
    const periodDuration = config.periodDurationMinutes || 40;
    for (let i = 0; i < config.periodsPerDay; i++) {
      const slotStart = startMinutes + i * periodDuration;
      const slotEnd = slotStart + periodDuration;
      out.push({
        startTime: this.formatMinutesAsTime(slotStart),
        endTime: this.formatMinutesAsTime(slotEnd),
      });
    }
    return out;
  }

  private buildBreakPeriodsForPreview(
    config: TimetableConfig | null,
    timeSlots: Array<{ startTime: string; endTime: string }>
  ): Array<{ period: number; name: string; startTime: string; endTime: string }> {
    const breakPeriods: Array<{
      period: number;
      name: string;
      startTime: string;
      endTime: string;
    }> = [];
    if (!config?.breakPeriods?.length) return breakPeriods;

    config.breakPeriods.forEach((breakPeriod) => {
      const breakStart = this.parseTimeToMinutes(breakPeriod.startTime);
      const breakEnd = this.parseTimeToMinutes(breakPeriod.endTime);
      for (let i = 0; i < timeSlots.length; i++) {
        const periodStart = this.parseTimeToMinutes(timeSlots[i].startTime);
        const periodEnd = this.parseTimeToMinutes(timeSlots[i].endTime);
        if (
          (breakStart >= periodStart && breakStart < periodEnd) ||
          (breakEnd > periodStart && breakEnd <= periodEnd) ||
          (breakStart <= periodStart && breakEnd >= periodEnd)
        ) {
          breakPeriods.push({
            period: i + 1,
            name: breakPeriod.name,
            startTime: breakPeriod.startTime,
            endTime: breakPeriod.endTime,
          });
          break;
        }
      }
    });
    return breakPeriods;
  }

  private buildTeacherPreviewColumns(
    allPeriods: number[],
    periodTimeSlots: Map<number, { startTime: string; endTime: string }>,
    breakPeriods: Array<{ period: number; name: string; startTime: string; endTime: string }>
  ): TimetablePreviewColumn[] {
    const cols: TimetablePreviewColumn[] = [];
    for (let i = 0; i < allPeriods.length; i++) {
      const period = allPeriods[i];
      const breakBefore = breakPeriods.find((bp) => bp.period === period);
      if (breakBefore && i === 0) {
        cols.push({
          kind: 'break',
          label: breakBefore.name,
          timeStart: breakBefore.startTime,
          timeEnd: breakBefore.endTime,
        });
      }
      const ts = periodTimeSlots.get(period);
      cols.push({
        kind: 'period',
        period,
        timeStart: ts?.startTime || '',
        timeEnd: ts?.endTime || '',
      });
      const breakAfter = breakPeriods.find((bp) => bp.period === period + 1);
      if (breakAfter && i < allPeriods.length - 1) {
        cols.push({
          kind: 'break',
          label: breakAfter.name,
          timeStart: breakAfter.startTime,
          timeEnd: breakAfter.endTime,
        });
      }
    }
    return cols;
  }

  /** Shared grid (cells + columns + days) for print-style teacher/class preview sheets. */
  private buildPreviewSheetGridFromSlots(
    arr: TimetableSlot[],
    config: TimetableConfig | null,
    globalPeriodTimeSlots: Map<number, { startTime: string; endTime: string }>,
    breakPeriods: Array<{ period: number; name: string; startTime: string; endTime: string }>
  ): {
    cells: Record<string, TimetableSlot[]>;
    daysOfWeek: string[];
    columns: TimetablePreviewColumn[];
  } {
    const cells: Record<string, TimetableSlot[]> = {};
    arr.forEach((slot) => {
      const k = `${slot.dayOfWeek}-${slot.periodNumber}`;
      if (!cells[k]) cells[k] = [];
      cells[k].push(slot);
    });

    let allPeriods: number[];
    let daysOfWeek: string[];
    let sheetPeriodMap: Map<number, { startTime: string; endTime: string }>;

    if (config) {
      allPeriods = Array.from({ length: config.periodsPerDay }, (_, idx) => idx + 1);
      daysOfWeek = this.sortDays([...config.daysOfWeek]);
      sheetPeriodMap = globalPeriodTimeSlots;
    } else {
      const pSet = new Set<number>();
      const dSet = new Set<string>();
      arr.forEach((s) => {
        pSet.add(s.periodNumber);
        dSet.add(s.dayOfWeek);
      });
      allPeriods = Array.from(pSet).sort((a, b) => a - b);
      daysOfWeek = this.sortDays(Array.from(dSet));
      sheetPeriodMap = new Map();
      allPeriods.forEach((p) => {
        const sample = arr.find((s) => s.periodNumber === p);
        if (sample?.startTime && sample?.endTime) {
          sheetPeriodMap.set(p, {
            startTime: sample.startTime,
            endTime: sample.endTime,
          });
        }
      });
    }

    const columns = this.buildTeacherPreviewColumns(
      allPeriods,
      sheetPeriodMap,
      config ? breakPeriods : []
    );

    return { cells, daysOfWeek, columns };
  }

  private resolveClassTeacherLabel(classId: string): string | null {
    const c = this.classes.find((x) => String(x.id) === String(classId));
    if (c?.classTeacher) {
      const t = c.classTeacher;
      const fn = t.firstName ?? t.user?.firstName ?? '';
      const ln = t.lastName ?? t.user?.lastName ?? '';
      const name = `${fn} ${ln}`.trim();
      return name || null;
    }
    if (!c?.teachers?.length) {
      return null;
    }
    const t = c.teachers[0];
    const fn = t.firstName ?? t.user?.firstName ?? '';
    const ln = t.lastName ?? t.user?.lastName ?? '';
    const name = `${fn} ${ln}`.trim();
    return name || null;
  }

  private buildTeacherPreviewSheets(
    teachingSlots: TimetableSlot[],
    config: TimetableConfig | null,
    schoolName: string,
    versionTitle: string,
    schoolLogo: string | null
  ): TimetableTeacherPreviewSheet[] {
    const generatedAtLabel = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });

    const byTeacher = new Map<string, TimetableSlot[]>();
    teachingSlots.forEach((s) => {
      if (!byTeacher.has(s.teacherId)) byTeacher.set(s.teacherId, []);
      byTeacher.get(s.teacherId)!.push(s);
    });

    let timeSlots: Array<{ startTime: string; endTime: string }> = [];
    const periodTimeSlots = new Map<number, { startTime: string; endTime: string }>();

    if (config) {
      timeSlots = this.calculateTimeSlotsFromConfig(config);
      for (let i = 0; i < timeSlots.length; i++) {
        periodTimeSlots.set(i + 1, timeSlots[i]);
      }
    }

    const breakPeriods = this.buildBreakPeriodsForPreview(
      config,
      timeSlots.length ? timeSlots : [{ startTime: '08:00', endTime: '08:40' }]
    );

    return Array.from(byTeacher.entries())
      .map(([teacherId, arr]) => {
        const t = arr[0]?.teacher;
        const teacherName = t
          ? `${t.firstName} ${t.lastName}`.trim()
          : `Teacher ${teacherId}`;

        const { cells, daysOfWeek, columns } = this.buildPreviewSheetGridFromSlots(
          arr,
          config,
          periodTimeSlots,
          breakPeriods
        );

        return {
          teacherId,
          teacherName,
          schoolName,
          versionTitle,
          schoolLogo,
          daysOfWeek,
          columns,
          cells,
          generatedAtLabel,
        };
      })
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName));
  }

  private buildClassPreviewSheets(
    teachingSlots: TimetableSlot[],
    config: TimetableConfig | null,
    schoolName: string,
    versionTitle: string,
    schoolLogo: string | null
  ): TimetableClassPreviewSheet[] {
    const generatedAtLabel = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });

    const byClass = new Map<string, TimetableSlot[]>();
    teachingSlots.forEach((s) => {
      if (!byClass.has(s.classId)) byClass.set(s.classId, []);
      byClass.get(s.classId)!.push(s);
    });

    let timeSlots: Array<{ startTime: string; endTime: string }> = [];
    const periodTimeSlots = new Map<number, { startTime: string; endTime: string }>();

    if (config) {
      timeSlots = this.calculateTimeSlotsFromConfig(config);
      for (let i = 0; i < timeSlots.length; i++) {
        periodTimeSlots.set(i + 1, timeSlots[i]);
      }
    }

    const breakPeriods = this.buildBreakPeriodsForPreview(
      config,
      timeSlots.length ? timeSlots : [{ startTime: '08:00', endTime: '08:40' }]
    );

    return Array.from(byClass.entries())
      .map(([classId, arr]) => {
        const c = arr[0]?.class;
        const className = c?.name || `Class ${classId}`;
        const classTeacherLabel = this.resolveClassTeacherLabel(classId);

        const { cells, daysOfWeek, columns } = this.buildPreviewSheetGridFromSlots(
          arr,
          config,
          periodTimeSlots,
          breakPeriods
        );

        return {
          classId,
          className,
          classTeacherLabel,
          schoolName,
          versionTitle,
          schoolLogo,
          daysOfWeek,
          columns,
          cells,
          generatedAtLabel,
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className));
  }

  /** Same structure as consolidated PDF: teachers × days × period strip (with breaks). */
  private buildConsolidatedPreviewSheet(
    teachingSlots: TimetableSlot[],
    config: TimetableConfig | null,
    versionTitle: string,
    schoolLogo: string | null
  ): TimetableConsolidatedPreviewSheet {
    const generatedAtLabel = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });

    let timeSlots: Array<{ startTime: string; endTime: string }> = [];
    const periodTimeSlots = new Map<number, { startTime: string; endTime: string }>();

    if (config) {
      timeSlots = this.calculateTimeSlotsFromConfig(config);
      for (let i = 0; i < timeSlots.length; i++) {
        periodTimeSlots.set(i + 1, timeSlots[i]);
      }
    }

    const breakPeriods = this.buildBreakPeriodsForPreview(
      config,
      timeSlots.length ? timeSlots : [{ startTime: '08:00', endTime: '08:40' }]
    );

    let allPeriods: number[];
    let daysOfWeek: string[];
    let sheetPeriodMap: Map<number, { startTime: string; endTime: string }>;

    if (config) {
      allPeriods = Array.from({ length: config.periodsPerDay }, (_, idx) => idx + 1);
      daysOfWeek = this.sortDays([...config.daysOfWeek]);
      sheetPeriodMap = periodTimeSlots;
    } else {
      const pSet = new Set<number>();
      const dSet = new Set<string>();
      teachingSlots.forEach((s) => {
        pSet.add(s.periodNumber);
        dSet.add(s.dayOfWeek);
      });
      allPeriods = Array.from(pSet).sort((a, b) => a - b);
      daysOfWeek = this.sortDays(Array.from(dSet));
      sheetPeriodMap = new Map();
      allPeriods.forEach((p) => {
        const sample = teachingSlots.find((s) => s.periodNumber === p);
        if (sample?.startTime && sample?.endTime) {
          sheetPeriodMap.set(p, {
            startTime: sample.startTime,
            endTime: sample.endTime,
          });
        }
      });
    }

    const dayStripColumns = this.buildTeacherPreviewColumns(
      allPeriods,
      sheetPeriodMap,
      config ? breakPeriods : []
    );

    const cellMap: Record<string, TimetableSlot> = {};
    teachingSlots.forEach((s) => {
      const k = `${s.teacherId}|${s.dayOfWeek}|${s.periodNumber}`;
      if (!cellMap[k]) {
        cellMap[k] = s;
      }
    });

    const teacherIds = [...new Set(teachingSlots.map((x) => x.teacherId))];
    const teachers = teacherIds
      .map((teacherId) => {
        const s = teachingSlots.find((x) => x.teacherId === teacherId);
        const t = s?.teacher;
        const teacherName = t
          ? `${t.firstName} ${t.lastName}`.trim()
          : `Teacher ${teacherId}`;
        return { teacherId, teacherName };
      })
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName));

    return {
      versionTitle,
      schoolLogo,
      generatedAtLabel,
      daysOfWeek,
      dayStripColumns,
      teachers,
      cellMap,
    };
  }
}


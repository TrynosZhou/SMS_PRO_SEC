import { Component, OnInit } from '@angular/core';
import { TeacherService } from '../../../services/teacher.service';
import { ClassService } from '../../../services/class.service';
import { Router } from '@angular/router';
import { teachersManageNav } from '../teachers-manage-navigation';

@Component({
  selector: 'app-assign-classes',
  templateUrl: './assign-classes.component.html',
  styleUrls: ['./assign-classes.component.css']
})
export class AssignClassesComponent implements OnInit {
  teachers: any[] = [];
  filteredTeachers: any[] = [];
  selectedTeacher: any = null;
  availableClasses: any[] = [];
  teacherClasses: any[] = [];
  teacherLoad: any = null;
  selectedClassIds: string[] = [];
  teacherSearchQuery = '';
  classSearchQuery = '';
  loading = false;
  loadingLoad = false;
  error = '';
  success = '';
  submitting = false;

  constructor(
    private teacherService: TeacherService,
    private classService: ClassService,
    public router: Router
  ) { }

  ngOnInit() {
    this.loadTeachers();
    this.loadClasses();
  }

  goToTeachersList(): void {
    this.router.navigateByUrl(teachersManageNav(this.router).list);
  }

  loadTeachers() {
    this.loading = true;
    this.error = '';
    this.teacherService.getTeachers().subscribe({
      next: (data: any) => {
        this.teachers = (data || []).filter((t: any) => t.isActive !== false);
        this.filteredTeachers = [...this.teachers];
        this.loading = false;
      },
      error: (err: any) => {
        this.error = 'Failed to load teachers';
        this.loading = false;
        console.error('Error loading teachers:', err);
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        const activeClasses = classesList.filter((c: any) => c.isActive !== false);
        this.availableClasses = this.classService.sortClasses(activeClasses);
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
      }
    });
  }

  filterTeachers() {
    if (!this.teacherSearchQuery.trim()) {
      this.filteredTeachers = [...this.teachers];
      return;
    }
    const query = this.teacherSearchQuery.toLowerCase();
    this.filteredTeachers = this.teachers.filter(teacher =>
      teacher.firstName?.toLowerCase().includes(query) ||
      teacher.lastName?.toLowerCase().includes(query) ||
      teacher.teacherId?.toLowerCase().includes(query)
    );
  }

  selectTeacher(teacher: any) {
    this.selectedTeacher = teacher;
    this.selectedClassIds = [];
    this.teacherClasses = [];
    this.teacherLoad = null;
    this.error = '';
    this.success = '';
    this.loadTeacherClasses();
    this.loadTeacherLoad();
  }

  loadTeacherClasses() {
    if (!this.selectedTeacher?.id) return;
    
    this.loading = true;
    this.error = '';
    this.teacherService.getTeacherClasses(this.selectedTeacher.id).subscribe({
      next: (response: any) => {
        const classesList = response.classes || [];
        this.teacherClasses = this.classService.sortClasses(classesList);
        this.selectedClassIds = this.teacherClasses.map((c: any) => c.id);
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading teacher classes:', err);
        // If it's a 500 error, the backend might be having issues, but we can still proceed
        // with an empty list - the user can still assign classes
        this.teacherClasses = [];
        this.selectedClassIds = [];
        this.loading = false;
        // Only show error if it's not a server error (might be temporary)
        if (err.status !== 500) {
          this.error = 'Failed to load teacher classes. You can still assign classes.';
          setTimeout(() => this.error = '', 5000);
        }
      }
    });
  }

  loadTeacherLoad() {
    if (!this.selectedTeacher?.id) return;
    
    this.loadingLoad = true;
    this.teacherService.getTeacherLoad(this.selectedTeacher.id).subscribe({
      next: (data: any) => {
        this.teacherLoad = data;
        this.loadingLoad = false;
      },
      error: (err: any) => {
        console.error('Error loading teacher load:', err);
        this.loadingLoad = false;
      }
    });
  }

  toggleClass(classId: string) {
    const index = this.selectedClassIds.indexOf(classId);
    if (index > -1) {
      this.selectedClassIds.splice(index, 1);
    } else {
      this.selectedClassIds.push(classId);
    }
  }

  isClassSelected(classId: string): boolean {
    return this.selectedClassIds.includes(classId);
  }

  filterClasses() {
    // Filtering is handled in the template
  }

  getFilteredClasses(): any[] {
    if (!this.classSearchQuery.trim()) {
      return this.availableClasses;
    }
    const query = this.classSearchQuery.toLowerCase();
    return this.availableClasses.filter(cls =>
      cls.name?.toLowerCase().includes(query) ||
      cls.form?.toLowerCase().includes(query)
    );
  }

  getStudentCountForClass(classId: string): number {
    if (!this.teacherLoad?.load?.classes) return 0;
    const classLoad = this.teacherLoad.load.classes.find((c: any) => c.id === classId);
    return classLoad?.studentCount || 0;
  }

  clearSelection() {
    this.selectedTeacher = null;
    this.selectedClassIds = [];
    this.teacherClasses = [];
    this.teacherLoad = null;
    this.teacherSearchQuery = '';
    this.classSearchQuery = '';
    this.error = '';
    this.success = '';
  }

  saveAssignment() {
    if (!this.selectedTeacher) {
      this.error = 'Please select a teacher first';
      return;
    }

    this.submitting = true;
    this.error = '';
    this.success = '';

    this.teacherService.assignClassesToTeacher(this.selectedTeacher.id, this.selectedClassIds).subscribe({
      next: (response: any) => {
        this.success = 'Classes assigned successfully';
        this.submitting = false;
        // Reload teacher classes and load
        this.loadTeacherClasses();
        this.loadTeacherLoad();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to assign classes';
        this.submitting = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}


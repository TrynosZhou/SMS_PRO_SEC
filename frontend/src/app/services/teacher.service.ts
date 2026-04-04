import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TeacherService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getTeachers(options: { page?: number; limit?: number; search?: string } = {}): Observable<any> {
    const params: any = {};
    if (options.page) params.page = String(options.page);
    if (options.limit) params.limit = String(options.limit);
    if (options.search) params.search = options.search;
    return this.http.get(`${this.apiUrl}/teachers`, { params });
  }

  getCurrentTeacher(): Observable<any> {
    return this.http.get(`${this.apiUrl}/teachers/me`);
  }

  getTeacherById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/teachers/${id}`);
  }

  createTeacher(teacher: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/teachers`, teacher);
  }

  updateTeacher(id: string, teacher: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/teachers/${id}`, teacher);
  }

  getTeacherClasses(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/teachers/${id}/classes`);
  }

  assignClassesToTeacher(id: string, classIds: string[]): Observable<any> {
    return this.http.put(`${this.apiUrl}/teachers/${id}/classes`, { classIds });
  }

  /** Link teacher to teach one subject in one class (updates teacher, class, and subject relations). */
  assignTeacherClassSubject(teacherId: string, classId: string, subjectId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/teachers/${teacherId}/class-subject`, { classId, subjectId });
  }

  unassignTeacherClassSubject(teacherId: string, classId: string, subjectId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/teachers/${teacherId}/class-subject/remove`, { classId, subjectId });
  }

  getTeacherLoad(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/teachers/${id}/load`);
  }

  /** All teachers with weekly lesson totals (subject-assignment hub). */
  getSubjectAssignmentSummary(): Observable<{ teachers: any[] }> {
    return this.http.get<{ teachers: any[] }>(`${this.apiUrl}/teachers/subject-assignment/summary`);
  }

  /** One teacher: subject × class rows with lessons/week from active timetable config. */
  getTeacherSubjectAssignment(teacherId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/teachers/${teacherId}/subject-assignment`);
  }

  createTeacherAccount(teacherId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/teachers/${teacherId}/create-account`, {});
  }

  deleteTeacher(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/teachers/${id}`);
  }
}


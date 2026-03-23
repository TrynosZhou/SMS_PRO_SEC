import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PayrollService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // Employees
  getEmployees(params?: { search?: string; department?: string; status?: string }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.search) httpParams = httpParams.set('search', params.search);
    if (params?.department) httpParams = httpParams.set('department', params.department);
    if (params?.status) httpParams = httpParams.set('status', params.status);
    return this.http.get(`${this.apiUrl}/payroll/employees`, { params: httpParams });
  }

  createEmployee(body: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/payroll/employees`, body);
  }

  updateEmployee(id: string, body: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/payroll/employees/${id}`, body);
  }

  deleteEmployee(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/payroll/employees/${id}`);
  }

  // Salary structures
  getSalaryStructures(params?: { salaryType?: string }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.salaryType) httpParams = httpParams.set('salaryType', params.salaryType);
    return this.http.get(`${this.apiUrl}/payroll/salary-structures`, { params: httpParams });
  }

  createOrUpdateSalaryStructure(body: any, id?: string): Observable<any> {
    if (id) {
      return this.http.put(`${this.apiUrl}/payroll/salary-structures/${id}`, body);
    }
    return this.http.post(`${this.apiUrl}/payroll/salary-structures`, body);
  }

  // Runs
  /** Server always generates for the current calendar month; optional notes only. */
  generateRun(body?: { notes?: string }): Observable<any> {
    const payload: { notes?: string } = {};
    if (body?.notes != null && String(body.notes).trim() !== '') {
      payload.notes = String(body.notes).trim();
    }
    return this.http.post(`${this.apiUrl}/payroll/runs/generate`, payload);
  }

  getRuns(params?: { month?: number; year?: number }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.month) httpParams = httpParams.set('month', String(params.month));
    if (params?.year) httpParams = httpParams.set('year', String(params.year));
    return this.http.get(`${this.apiUrl}/payroll/runs`, { params: httpParams });
  }

  getRunDetails(runId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/payroll/runs/${runId}`);
  }

  adjustLine(runId: string, body: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/payroll/runs/${runId}/adjust`, body);
  }

  approveRun(runId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/payroll/runs/${runId}/approve`, {});
  }

  payRun(runId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/payroll/runs/${runId}/pay`, {});
  }

  // Payslips
  getPayslips(params?: { runId?: string }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.runId) httpParams = httpParams.set('runId', params.runId);
    return this.http.get(`${this.apiUrl}/payroll/payslips`, { params: httpParams });
  }

  downloadPayslip(payslipId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/payroll/payslips/${payslipId}/download`, {
      responseType: 'blob'
    });
  }

  /** Opens PDF preview (same layout as saved payslip; works for draft or approved runs). */
  previewPayslipLine(runId: string, lineId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/payroll/runs/${runId}/lines/${lineId}/preview-payslip`, {
      responseType: 'blob'
    });
  }

  // Reports
  getMonthlySummary(params: { month: number; year: number }): Observable<any> {
    const httpParams = new HttpParams()
      .set('month', String(params.month))
      .set('year', String(params.year));
    return this.http.get(`${this.apiUrl}/payroll/reports/monthly-summary`, { params: httpParams });
  }

  getDepartmentReport(params: { month: number; year: number; department?: string }): Observable<any> {
    let httpParams = new HttpParams()
      .set('month', String(params.month))
      .set('year', String(params.year));
    if (params.department) httpParams = httpParams.set('department', params.department);
    return this.http.get(`${this.apiUrl}/payroll/reports/department`, { params: httpParams });
  }
}


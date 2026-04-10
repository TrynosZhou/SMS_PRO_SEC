import { Component, OnInit } from '@angular/core';
import { DepartmentsService } from '../../../services/departments.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-departments',
  templateUrl: './departments.component.html',
  styleUrls: ['./departments.component.css'],
})
export class DepartmentsComponent implements OnInit {
  departments: any[] = [];
  loading = false;
  error = '';
  success = '';

  newName = '';

  constructor(private deps: DepartmentsService, private auth: AuthService) {}

  ngOnInit(): void {
    this.load();
  }

  canManage(): boolean {
    return this.auth.hasRole('admin') || this.auth.hasRole('superadmin');
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.deps.list().subscribe({
      next: (rows) => {
        this.departments = rows || [];
        this.loading = false;
      },
      error: (e) => {
        this.departments = [];
        this.loading = false;
        this.error = e?.error?.message || 'Failed to load departments';
      },
    });
  }

  add(): void {
    this.success = '';
    this.error = '';
    const name = String(this.newName || '').trim();
    if (!name) {
      this.error = 'Enter a department name.';
      return;
    }
    this.deps.create({ name }).subscribe({
      next: () => {
        this.newName = '';
        this.success = 'Department added.';
        this.load();
      },
      error: (e) => {
        this.error = e?.error?.message || 'Failed to add department';
      },
    });
  }

  toggleActive(dep: any): void {
    if (!dep?.id) return;
    this.success = '';
    this.error = '';
    const next = !Boolean(dep.isActive);
    this.deps.update(dep.id, { isActive: next }).subscribe({
      next: () => {
        dep.isActive = next;
        this.success = 'Updated.';
      },
      error: (e) => (this.error = e?.error?.message || 'Failed to update'),
    });
  }

  rename(dep: any, value: string): void {
    if (!dep?.id) return;
    const name = String(value || '').trim();
    if (!name) return;
    this.success = '';
    this.error = '';
    this.deps.update(dep.id, { name }).subscribe({
      next: (row) => {
        dep.name = row?.name || name;
        this.success = 'Updated.';
      },
      error: (e) => (this.error = e?.error?.message || 'Failed to update'),
    });
  }

  remove(dep: any): void {
    if (!dep?.id) return;
    this.success = '';
    this.error = '';
    if (!confirm(`Delete department "${dep.name}"?`)) return;
    this.deps.delete(dep.id).subscribe({
      next: () => {
        this.success = 'Deleted.';
        this.load();
      },
      error: (e) => (this.error = e?.error?.message || 'Failed to delete'),
    });
  }
}


import { Component } from '@angular/core';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-finance-manage',
  templateUrl: './finance-manage.component.html',
  styleUrls: ['./finance-manage.component.css'],
})
export class FinanceManageComponent {
  constructor(private authService: AuthService) {}

  showAuditTab(): boolean {
    return (
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('accountant')
    );
  }
}

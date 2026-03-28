import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AccountService } from '../../../services/account.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-create-admin-account',
  templateUrl: './create-admin-account.component.html',
  styleUrls: ['./create-admin-account.component.css'],
})
export class CreateAdminAccountComponent {
  email = '';
  username = '';
  password = '';
  confirmPassword = '';
  loading = false;
  error = '';
  success = '';

  constructor(
    private accountService: AccountService,
    private authService: AuthService,
    private router: Router
  ) {}

  submit(): void {
    this.error = '';
    this.success = '';

    const email = this.email.trim();
    const username = this.username.trim();
    const password = this.password;
    const confirm = this.confirmPassword;

    if (!email || !username || !password) {
      this.error = 'Email, username, and password are required.';
      return;
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      this.error = 'Please enter a valid email address.';
      return;
    }
    if (password.length < 8) {
      this.error = 'Password must be at least 8 characters.';
      return;
    }
    if (password !== confirm) {
      this.error = 'Passwords do not match.';
      return;
    }

    this.loading = true;
    this.accountService
      .createUserAccount({
        email,
        username,
        role: 'admin',
        password,
        generatePassword: false,
      })
      .subscribe({
        next: () => {
          this.loading = false;
          this.success = 'Administrator account created. They can sign in with this email or username and the password you set.';
          this.email = '';
          this.username = '';
          this.password = '';
          this.confirmPassword = '';
        },
        error: (err: any) => {
          this.loading = false;
          this.error =
            err?.error?.message ||
            err?.message ||
            'Could not create the account.';
        },
      });
  }

  goDashboard(): void {
    const user = this.authService.getCurrentUser();
    if (user?.role === 'parent') {
      this.router.navigate(['/parent/dashboard']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}

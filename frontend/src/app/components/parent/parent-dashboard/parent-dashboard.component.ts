import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';
import { ExamService } from '../../../services/exam.service';
import { SettingsService } from '../../../services/settings.service';
import { FinanceService } from '../../../services/finance.service';

@Component({
  selector: 'app-parent-dashboard',
  templateUrl: './parent-dashboard.component.html',
  styleUrls: ['./parent-dashboard.component.css']
})
export class ParentDashboardComponent implements OnInit {
  students: any[] = [];
  filteredStudents: any[] = [];
  loading = false;
  error = '';
  currencySymbol = 'KES';
  parentName = '';
  mobileMenuOpen = false;
  isMobile = false;
  searchTerm = '';
  sortBy: 'name' | 'balance-high' | 'balance-low' = 'name';
  lastUpdated: Date | null = null;

  constructor(
    private parentService: ParentService,
    private authService: AuthService,
    private examService: ExamService,
    private settingsService: SettingsService,
    private financeService: FinanceService,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = 'Parent';
    }
  }

  ngOnInit() {
    this.loadSettings();
    this.loadStudents();
    this.checkMobile();
    window.addEventListener('resize', () => this.checkMobile());
  }

  checkMobile() {
    this.isMobile = window.innerWidth <= 768;
    if (!this.isMobile) {
      this.mobileMenuOpen = false;
    }
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu() {
    this.mobileMenuOpen = false;
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || 'KES';
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
      }
    });
  }

  loadStudents() {
    this.loading = true;
    this.error = '';
    
    this.parentService.getLinkedStudents().subscribe({
      next: (response: any) => {
        this.students = response.students || [];
        this.applyFilters();
        this.lastUpdated = new Date();
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
          setTimeout(() => {
            this.authService.logout();
          }, 2000);
        } else {
          this.error = err.error?.message || 'Failed to load students';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  viewReportCard(student: any) {
    // Check if term balance allows access (term balance must be zero)
    const termBalance = parseFloat(String(student.termBalance || 0));
    
    if (termBalance > 0) {
      this.error = `Report card access is restricted. Please clear the outstanding term balance of ${this.currencySymbol} ${termBalance.toFixed(2)} to view the report card.`;
      setTimeout(() => this.error = '', 8000);
      return;
    }

    // Navigate to report card page with student ID
    this.router.navigate(['/report-cards'], {
      queryParams: { studentId: student.id }
    });
  }

  unlinkStudent(studentId: string) {
    if (!confirm('Are you sure you want to unlink this student?')) {
      return;
    }

    this.parentService.unlinkStudent(studentId).subscribe({
      next: () => {
        this.loadStudents();
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to unlink student';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  linkMoreStudents() {
    this.router.navigate(['/parent/link-students']);
  }

  logout() {
    this.authService.logout();
  }

  manageAccount() {
    this.router.navigate(['/parent/manage-account']);
  }

  getFirstStudent(): any {
    return this.students.length > 0 ? this.students[0] : null;
  }

  getTotalStudents(): number {
    return this.students.length;
  }

  getPendingFeesCount(): number {
    return this.getStudentsWithDueBalance();
  }

  getOutstandingBalance(): number {
    return this.students.reduce((sum, student) => {
      const balance = Number(student.currentInvoiceBalance || 0);
      return balance > 0 ? sum + balance : sum;
    }, 0);
  }

  getCreditBalance(): number {
    return this.students.reduce((sum, student) => {
      const balance = Number(student.currentInvoiceBalance || 0);
      return balance < 0 ? sum + Math.abs(balance) : sum;
    }, 0);
  }

  getStudentsWithClearTermBalance(): number {
    return this.students.filter((student) => Number(student.termBalance || 0) === 0).length;
  }

  getStudentsWithDueBalance(): number {
    return this.students.filter((student) => Number(student.currentInvoiceBalance || 0) > 0).length;
  }

  getStudentsInCreditCount(): number {
    return this.students.filter((student) => Number(student.currentInvoiceBalance || 0) < 0).length;
  }

  getStudentsSettledCount(): number {
    return this.students.filter((student) => Number(student.currentInvoiceBalance || 0) === 0).length;
  }

  getStudentsWithRestrictedReportCard(): number {
    return this.students.filter((student) => Number(student.termBalance || 0) > 0).length;
  }

  getAverageOutstandingPerDueStudent(): number {
    const dueStudents = this.students.filter((student) => Number(student.currentInvoiceBalance || 0) > 0);
    if (dueStudents.length === 0) {
      return 0;
    }
    return this.getOutstandingBalance() / dueStudents.length;
  }

  getPaymentReadinessPercent(): number {
    if (!this.students.length) {
      return 0;
    }

    const readiness = (this.getStudentsWithClearTermBalance() / this.students.length) * 100;
    return Math.round(readiness);
  }

  getStudentBadge(student: any): string {
    const balance = Number(student.currentInvoiceBalance || 0);
    if (balance > 0) {
      return 'Payment Due';
    }
    if (balance < 0) {
      return 'In Credit';
    }
    return 'Settled';
  }

  getTermBalanceBadge(student: any): string {
    return Number(student.termBalance || 0) > 0 ? 'Report Card Locked' : 'Report Card Ready';
  }

  getTermBalanceIsClear(student: any): boolean {
    return Number(student.termBalance || 0) === 0;
  }

  formatCurrency(amount: number): string {
    return `${this.currencySymbol} ${Number(amount || 0).toFixed(2)}`;
  }

  getLastUpdatedText(): string {
    if (!this.lastUpdated) {
      return 'Not yet refreshed';
    }
    return this.lastUpdated.toLocaleString();
  }

  getWelcomeGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }

  getTodayDisplayDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  onSearchTermChange(term: string) {
    this.searchTerm = term;
    this.applyFilters();
  }

  onSortByChange(sortBy: 'name' | 'balance-high' | 'balance-low') {
    this.sortBy = sortBy;
    this.applyFilters();
  }

  refreshDashboard() {
    this.loadStudents();
  }

  applyFilters() {
    const normalizedSearch = this.searchTerm.trim().toLowerCase();

    const filtered = this.students.filter((student) => {
      if (!normalizedSearch) {
        return true;
      }

      const fullName = `${student.firstName || ''} ${student.lastName || ''}`.toLowerCase();
      const studentNumber = String(student.studentNumber || '').toLowerCase();
      const className = String(student.class?.name || '').toLowerCase();
      return fullName.includes(normalizedSearch)
        || studentNumber.includes(normalizedSearch)
        || className.includes(normalizedSearch);
    });

    this.filteredStudents = filtered.sort((a, b) => {
      const balanceA = Number(a.currentInvoiceBalance || 0);
      const balanceB = Number(b.currentInvoiceBalance || 0);

      if (this.sortBy === 'balance-high') {
        return balanceB - balanceA;
      }

      if (this.sortBy === 'balance-low') {
        return balanceA - balanceB;
      }

      const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
      const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  viewReportCardForFirstStudent() {
    const firstStudent = this.filteredStudents.length > 0 ? this.filteredStudents[0] : this.getFirstStudent();
    if (firstStudent) {
      this.viewReportCard(firstStudent);
    }
  }

  openInbox() {
    this.router.navigate(['/parent/inbox']);
  }

  openOutbox() {
    this.router.navigate(['/parent/inbox'], { queryParams: { tab: 'outbox' } });
  }

  makePayment() {
    // Navigate to payment page or open payment modal
    this.router.navigate(['/parent/payment']);
  }

  viewCurrentInvoice() {
    if (this.students.length === 0) {
      this.error = 'No linked students found. Please link a student first.';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    // Get the first linked student's invoices
    const firstStudent = this.students[0];
    
    // Fetch invoices for this student
    this.financeService.getInvoices(firstStudent.id).subscribe({
      next: (invoices: any[]) => {
        if (invoices.length === 0) {
          this.error = 'No invoices found for this student.';
          setTimeout(() => this.error = '', 5000);
          return;
        }

        // Get the most recent invoice
        const latestInvoice = invoices.sort((a: any, b: any) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        })[0];

        // View the invoice PDF
        this.financeService.getInvoicePDF(latestInvoice.id).subscribe({
          next: (result: { blob: Blob; filename: string }) => {
            const url = window.URL.createObjectURL(result.blob);
            // Create a download link with the proper filename
            const link = document.createElement('a');
            link.href = url;
            link.download = result.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            // Clean up the URL after a delay to free memory
            setTimeout(() => window.URL.revokeObjectURL(url), 100);
          },
          error: (err: any) => {
            console.error('Error loading invoice PDF:', err);
            this.error = err.error?.message || 'Failed to load invoice PDF';
            setTimeout(() => this.error = '', 5000);
          }
        });
      },
      error: (err: any) => {
        console.error('Error fetching invoices:', err);
        this.error = err.error?.message || 'Failed to fetch invoices';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}

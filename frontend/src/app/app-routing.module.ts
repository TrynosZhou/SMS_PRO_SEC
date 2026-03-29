import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { StudentListComponent } from './components/students/student-list/student-list.component';
import { StudentFormComponent } from './components/students/student-form/student-form.component';
import { StudentsManageComponent } from './components/students/students-manage/students-manage.component';
import { TeacherListComponent } from './components/teachers/teacher-list/teacher-list.component';
import { TeacherFormComponent } from './components/teachers/teacher-form/teacher-form.component';
import { TeachersManageComponent } from './components/teachers/teachers-manage/teachers-manage.component';
import { AssignClassesComponent } from './components/teachers/assign-classes/assign-classes.component';
import { ExamListComponent } from './components/exams/exam-list/exam-list.component';
import { ExamFormComponent } from './components/exams/exam-form/exam-form.component';
import { MarksEntryComponent } from './components/exams/marks-entry/marks-entry.component';
import { ReportCardComponent } from './components/exams/report-card/report-card.component';
import { RankingsComponent } from './components/exams/rankings/rankings.component';
import { MarkSheetComponent } from './components/exams/mark-sheet/mark-sheet.component';
import { ModerateMarkComponent } from './components/exams/moderate-mark/moderate-mark.component';
import { MarkInputProgressComponent } from './components/exams/mark-input-progress/mark-input-progress.component';
import { PublishResultsComponent } from './components/exams/publish-results/publish-results.component';
import { ExamsManageComponent } from './components/exams/exams-manage/exams-manage.component';
import { InvoiceListComponent } from './components/finance/invoice-list/invoice-list.component';
import { InvoiceFormComponent } from './components/finance/invoice-form/invoice-form.component';
import { InvoiceStatementsComponent } from './components/finance/invoice-statements/invoice-statements.component';
import { CreditNoteComponent } from './components/finance/credit-note/credit-note.component';
import { DebitNoteComponent } from './components/finance/debit-note/debit-note.component';
import { PrepaidAdjustComponent } from './components/finance/prepaid-adjust/prepaid-adjust.component';
import { UniformListComponent } from './components/finance/uniform-list/uniform-list.component';
import { RecordPaymentComponent } from './components/finance/record-payment/record-payment.component';
import { OutstandingBalanceComponent } from './components/finance/outstanding-balance/outstanding-balance.component';
import { BalanceEnquiryComponent } from './components/finance/balance-enquiry/balance-enquiry.component';
import { TransactionAuditComponent } from './components/finance/transaction-audit/transaction-audit.component';
import { ClassListComponent } from './components/classes/class-list/class-list.component';
import { ClassFormComponent } from './components/classes/class-form/class-form.component';
import { ClassListsComponent } from './components/classes/class-lists/class-lists.component';
import { ClassesManageComponent } from './components/classes/classes-manage/classes-manage.component';
import { SubjectListComponent } from './components/subjects/subject-list/subject-list.component';
import { SubjectFormComponent } from './components/subjects/subject-form/subject-form.component';
import { SettingsComponent } from './components/settings/settings.component';
import { ParentDashboardComponent } from './components/parent/parent-dashboard/parent-dashboard.component';
import { LinkStudentsComponent } from './components/parent/link-students/link-students.component';
import { ParentInboxComponent } from './components/parent/parent-inbox/parent-inbox.component';
import { ManageAccountComponent } from './components/teachers/manage-account/manage-account.component';
import { ManageAccountsComponent } from './components/admin/manage-accounts/manage-accounts.component';
import { ClassPromotionComponent } from './components/admin/class-promotion/class-promotion.component';
import { ElearningComponent } from './components/elearning/elearning.component';
import { ParentManagementComponent } from './components/admin/parent-management/parent-management.component';
import { MarkAttendanceComponent } from './components/attendance/mark-attendance/mark-attendance.component';
import { AttendanceReportsComponent } from './components/attendance/attendance-reports/attendance-reports.component';
import { RecordBookComponent } from './components/teacher/record-book/record-book.component';
import { MyClassesComponent } from './components/teacher/my-classes/my-classes.component';
import { TeacherRecordBookComponent } from './components/admin/teacher-record-book/teacher-record-book.component';
import { EtaskComponent } from './components/teacher/etask/etask.component';
import { EtaskSubmissionsComponent } from './components/teacher/etask-submissions/etask-submissions.component';
import { TeacherDashboardComponent } from './components/teacher/teacher-dashboard/teacher-dashboard.component';
import { StudentElearningTasksComponent } from './components/student/student-elearning-tasks/student-elearning-tasks.component';
import { TransferFormComponent } from './components/transfers/transfer-form/transfer-form.component';
import { TransferHistoryComponent } from './components/transfers/transfer-history/transfer-history.component';
import { EnrollStudentComponent } from './components/enrollments/enroll-student/enroll-student.component';
import { UnenrolledStudentsComponent } from './components/enrollments/unenrolled-students/unenrolled-students.component';
import { DHServicesReportComponent } from './components/reports/dh-services-report/dh-services-report.component';
import { TransportServicesReportComponent } from './components/reports/transport-services-report/transport-services-report.component';
import { StudentIdCardsComponent } from './components/reports/student-id-cards/student-id-cards.component';
import { AuthGuard } from './guards/auth.guard';
import { ModuleAccessGuard } from './guards/module-access.guard';
import { SplashComponent } from './components/splash/splash.component';
import { TimetableConfigComponent } from './components/timetable/timetable-config/timetable-config.component';
import { TimetableViewComponent } from './components/timetable/timetable-view/timetable-view.component';
import { StudentDashboardComponent } from './components/student/student-dashboard/student-dashboard.component';
import { StudentReportCardComponent } from './components/student/student-report-card/student-report-card.component';
import { StudentInvoiceStatementComponent } from './components/student/student-invoice-statement/student-invoice-statement.component';
import { UserLogComponent } from './components/settings/user-log/user-log.component';
import { PayrollManagementComponent } from './components/payroll/payroll-management/payroll-management.component';
import { SalaryAssignmentsComponent } from './components/payroll/salary-assignments/salary-assignments.component';

const routes: Routes = [
  { path: '', component: SplashComponent },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [AuthGuard] },
  { path: 'parent/dashboard', component: ParentDashboardComponent, canActivate: [AuthGuard] },
  { path: 'teacher/dashboard', component: TeacherDashboardComponent, canActivate: [AuthGuard] },
  { path: 'parent/inbox', component: ParentInboxComponent, canActivate: [AuthGuard] },
  { path: 'parent/link-students', component: LinkStudentsComponent, canActivate: [AuthGuard] },
  { path: 'parent/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'teacher/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'teacher/record-book', component: RecordBookComponent, canActivate: [AuthGuard] },
  { path: 'teacher/my-classes', component: MyClassesComponent, canActivate: [AuthGuard] },
  { path: 'etask/submissions', component: EtaskSubmissionsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'recordBook' } },
  { path: 'etask', component: EtaskComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'recordBook' } },
  { path: 'admin/manage-account', component: ManageAccountComponent, canActivate: [AuthGuard] },
  { path: 'admin/manage-accounts', component: ManageAccountsComponent, canActivate: [AuthGuard] },
  { path: 'admin/class-promotion', component: ClassPromotionComponent, canActivate: [AuthGuard] },
  { path: 'elearning', component: ElearningComponent, canActivate: [AuthGuard] },
  { path: 'admin/parent-management', component: ParentManagementComponent, canActivate: [AuthGuard] },
  { path: 'admin/teacher-record-book', component: TeacherRecordBookComponent, canActivate: [AuthGuard] },
  {
    path: 'students/manage',
    component: StudentsManageComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'students' },
      { path: 'add-new', component: StudentFormComponent, canActivate: [AuthGuard] },
      { path: 'students', component: StudentListComponent, canActivate: [AuthGuard] },
      { path: 'enroll', component: EnrollStudentComponent, canActivate: [AuthGuard] },
      { path: 'unenrolled', component: UnenrolledStudentsComponent, canActivate: [AuthGuard] },
      { path: 'transfer', component: TransferFormComponent, canActivate: [AuthGuard] },
      { path: 'edit/:id', component: StudentFormComponent, canActivate: [AuthGuard] },
    ],
  },
  { path: 'students_manage', redirectTo: 'students/manage', pathMatch: 'full' },
  { path: 'students', component: StudentListComponent, canActivate: [AuthGuard] },
  { path: 'students/new', component: StudentFormComponent, canActivate: [AuthGuard] },
  { path: 'students/:id/edit', component: StudentFormComponent, canActivate: [AuthGuard] },
  {
    path: 'teachers/manage',
    component: TeachersManageComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'teachers' },
      { path: 'add-new', component: TeacherFormComponent, canActivate: [AuthGuard] },
      { path: 'teachers', component: TeacherListComponent, canActivate: [AuthGuard] },
      { path: 'assign-classes', component: AssignClassesComponent, canActivate: [AuthGuard] },
      { path: 'record-book', component: TeacherRecordBookComponent, canActivate: [AuthGuard] },
      { path: 'edit/:id', component: TeacherFormComponent, canActivate: [AuthGuard] },
    ],
  },
  { path: 'teacher_manage', redirectTo: 'teachers/manage', pathMatch: 'full' },
  { path: 'teachers', component: TeacherListComponent, canActivate: [AuthGuard] },
  { path: 'teachers/new', component: TeacherFormComponent, canActivate: [AuthGuard] },
  { path: 'teachers/:id/edit', component: TeacherFormComponent, canActivate: [AuthGuard] },
  { path: 'teachers/assign-classes', component: AssignClassesComponent, canActivate: [AuthGuard] },
  {
    path: 'exams/manage',
    component: ExamsManageComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'marks-capturing' },
      { path: 'marks-capturing', component: ExamListComponent, canActivate: [AuthGuard] },
      { path: 'mark-sheet', component: MarkSheetComponent, canActivate: [AuthGuard] },
      { path: 'moderate-mark', component: ModerateMarkComponent, canActivate: [AuthGuard] },
      { path: 'mark-input-progress', component: MarkInputProgressComponent, canActivate: [AuthGuard] },
      { path: 'rankings', component: RankingsComponent, canActivate: [AuthGuard] },
      { path: 'report-cards', component: ReportCardComponent, canActivate: [AuthGuard] },
      { path: 'publish-results', component: PublishResultsComponent, canActivate: [AuthGuard] },
      { path: 'new', component: ExamFormComponent, canActivate: [AuthGuard] },
      { path: ':id/marks', component: MarksEntryComponent, canActivate: [AuthGuard] },
    ],
  },
  { path: 'exam_manage', redirectTo: 'exams/manage', pathMatch: 'full' },
  { path: 'exams', component: ExamListComponent, canActivate: [AuthGuard] },
  { path: 'exams/new', component: ExamFormComponent, canActivate: [AuthGuard] },
  { path: 'exams/moderate-mark', component: ModerateMarkComponent, canActivate: [AuthGuard] },
  { path: 'exams/mark-input-progress', component: MarkInputProgressComponent, canActivate: [AuthGuard] },
  { path: 'exams/:id/marks', component: MarksEntryComponent, canActivate: [AuthGuard] },
  { path: 'report-cards', component: ReportCardComponent, canActivate: [AuthGuard] },
  { path: 'mark-sheet', component: MarkSheetComponent, canActivate: [AuthGuard] },
  { path: 'rankings', component: RankingsComponent, canActivate: [AuthGuard] },
  { path: 'publish-results', component: PublishResultsComponent, canActivate: [AuthGuard] },
  { path: 'invoices', component: InvoiceListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/new', component: InvoiceFormComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/statements', component: InvoiceStatementsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/creditnote', component: CreditNoteComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/debitnote', component: DebitNoteComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/prepaid_adjust', component: PrepaidAdjustComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'invoices/uniform_list', component: UniformListComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'payments/record', component: RecordPaymentComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'outstanding-balance', component: OutstandingBalanceComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'balance_enquiry', component: BalanceEnquiryComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'audit_log', component: TransactionAuditComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'payroll', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'overview' } },
  { path: 'payroll/employees', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'employees' } },
  { path: 'payroll/structures/new', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'structures', structurePage: 'new' } },
  { path: 'payroll/structures', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'structures', structurePage: 'list' } },
  { path: 'payroll/assignments', component: SalaryAssignmentsComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance' } },
  { path: 'payroll/process', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'process' } },
  { path: 'payroll/payslips', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'payslips' } },
  { path: 'payroll/reports', component: PayrollManagementComponent, canActivate: [AuthGuard, ModuleAccessGuard], data: { module: 'finance', tab: 'reports' } },
  {
    path: 'classes/manage',
    component: ClassesManageComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'classes' },
      { path: 'classes', component: ClassListComponent, canActivate: [AuthGuard] },
      { path: 'lists', component: ClassListsComponent, canActivate: [AuthGuard] },
      { path: 'mark-register', component: MarkAttendanceComponent, canActivate: [AuthGuard] },
      { path: 'attendance-reports', component: AttendanceReportsComponent, canActivate: [AuthGuard] },
      { path: 'add-new', component: ClassFormComponent, canActivate: [AuthGuard] },
      { path: 'edit/:id', component: ClassFormComponent, canActivate: [AuthGuard] },
    ],
  },
  { path: 'class_manage', redirectTo: 'classes/manage', pathMatch: 'full' },
  { path: 'classes', component: ClassListComponent, canActivate: [AuthGuard] },
  { path: 'classes/new', component: ClassFormComponent, canActivate: [AuthGuard] },
  { path: 'classes/:id/edit', component: ClassFormComponent, canActivate: [AuthGuard] },
  { path: 'classes/lists', component: ClassListsComponent, canActivate: [AuthGuard] },
  { path: 'subjects', component: SubjectListComponent, canActivate: [AuthGuard] },
  { path: 'subjects/new', component: SubjectFormComponent, canActivate: [AuthGuard] },
  { path: 'subjects/:id/edit', component: SubjectFormComponent, canActivate: [AuthGuard] },
  { path: 'schools', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'attendance/mark', component: MarkAttendanceComponent, canActivate: [AuthGuard] },
  { path: 'attendance/reports', component: AttendanceReportsComponent, canActivate: [AuthGuard] },
  { path: 'transfers/new', component: TransferFormComponent, canActivate: [AuthGuard] },
  { path: 'transfers/history', component: TransferHistoryComponent, canActivate: [AuthGuard] },
  { path: 'transfers', redirectTo: '/transfers/history', pathMatch: 'full' },
  { path: 'student-management/transfer', component: TransferFormComponent, canActivate: [AuthGuard] },
  { path: 'enrollments/new', component: EnrollStudentComponent, canActivate: [AuthGuard] },
  { path: 'enrollments/unenrolled', component: UnenrolledStudentsComponent, canActivate: [AuthGuard] },
  { path: 'enrollments', redirectTo: '/enrollments/unenrolled', pathMatch: 'full' },
  { path: 'reports/dh-services', component: DHServicesReportComponent, canActivate: [AuthGuard] },
  { path: 'reports/transport-services', component: TransportServicesReportComponent, canActivate: [AuthGuard] },
  { path: 'reports/student-id-cards', component: StudentIdCardsComponent, canActivate: [AuthGuard] },
  { path: 'timetable/config', component: TimetableConfigComponent, canActivate: [AuthGuard] },
  { path: 'timetable', component: TimetableViewComponent, canActivate: [AuthGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [AuthGuard] },
  { path: 'user_log', component: UserLogComponent, canActivate: [AuthGuard] },
  { path: 'student/dashboard', component: StudentDashboardComponent, canActivate: [AuthGuard] },
  { path: 'student/report-card', component: StudentReportCardComponent, canActivate: [AuthGuard] },
  { path: 'student/invoice-statement', component: StudentInvoiceStatementComponent, canActivate: [AuthGuard] },
  { path: 'student/elearning', component: StudentElearningTasksComponent, canActivate: [AuthGuard] }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }


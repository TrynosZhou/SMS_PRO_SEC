import { Component, OnInit } from '@angular/core';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { ModuleAccessService } from './services/module-access.service';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { UserActivityService } from './services/user-activity.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  schoolName = 'School Management System';
  mobileMenuOpen = false;
  sidebarCollapsed = false;
  expandedMenus: { [key: string]: boolean } = {};
  private lastMenuAccessLogged = '';
  private lastMenuAccessLoggedAt = 0;

  constructor(
    public authService: AuthService, 
    private settingsService: SettingsService,
    public moduleAccessService: ModuleAccessService,
    private router: Router,
    private userActivityService: UserActivityService
  ) { }

  ngOnInit(): void {
    // Load school name from settings if authenticated
    if (this.authService.isAuthenticated()) {
      this.settingsService.getSettings().subscribe({
        next: (settings: any) => {
          this.schoolName = settings?.schoolName || 'School Management System';
        },
        error: () => {
          // ignore settings fetch errors to avoid blocking UI
        }
      });
      
      // Load module access settings
      this.moduleAccessService.loadModuleAccess();
    }

    // Track menu access (used by Activity Log)
    this.router.events
      .pipe(filter((event: any) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        if (!this.authService.isAuthenticated()) return;

        const user = this.authService.getCurrentUser();
        const role = user?.role;
        const shouldLog =
          role === 'admin' || role === 'superadmin' || role === 'accountant';

        if (!shouldLog) return;

        const url: string = event.urlAfterRedirects || event.url || '';
        const cleanUrl = url.split('?')[0];

        const now = Date.now();
        if (cleanUrl === this.lastMenuAccessLogged && now - this.lastMenuAccessLoggedAt < 3000) {
          return;
        }

        this.lastMenuAccessLogged = cleanUrl;
        this.lastMenuAccessLoggedAt = now;

        // Fire-and-forget: activity log should never block navigation.
        this.userActivityService.logMenuAccess(cleanUrl).subscribe({
          next: () => {},
          error: () => {}
        });
      });
  }

  isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  isParent(): boolean {
    return this.authService.hasRole('parent');
  }

  isTeacher(): boolean {
    return this.authService.hasRole('teacher');
  }

  isSuperAdmin(): boolean {
    return this.authService.hasRole('superadmin');
  }

  isAdmin(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  isStudent(): boolean {
    return this.authService.hasRole('student');
  }

  isDemoUser(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.isDemo === true || user?.email === 'demo@school.com' || user?.username === 'demo@school.com';
  }

  canAccessModule(moduleName: string): boolean {
    return this.moduleAccessService.canAccessModule(moduleName);
  }

  /** Who may use Student Manager → Enroll Student / enrollment APIs */
  canEnrollStudents(): boolean {
    return (
      this.isTeacher() ||
      this.isAdmin() ||
      this.authService.hasRole('accountant')
    );
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    // Prevent body scroll when menu is open
    if (this.mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
    document.body.style.overflow = '';
  }

  logout(): void {
    this.closeMobileMenu();
    this.authService.logout();
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    // Collapse all menus when sidebar is collapsed
    if (this.sidebarCollapsed) {
      this.expandedMenus = {};
    }
  }

  toggleMenu(menuKey: string): void {
    // Don't expand menus when sidebar is collapsed
    if (this.sidebarCollapsed) {
      return;
    }
    this.expandedMenus[menuKey] = !this.expandedMenus[menuKey];
  }

  isMenuExpanded(menuKey: string): boolean {
    return this.expandedMenus[menuKey] || false;
  }

  getCurrentUserRole(): string {
    const user = this.authService.getCurrentUser();
    if (!user) return '';
    
    if (user.role) {
      return user.role.toUpperCase();
    }
    
    // Fallback to checking roles
    if (this.isSuperAdmin()) return 'SUPERADMIN';
    if (this.isTeacher()) return 'TEACHER';
    if (this.isParent()) return 'PARENT';
    return 'ADMIN';
  }
}


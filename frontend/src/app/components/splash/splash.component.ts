import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.component.html',
  styleUrls: ['./splash.component.css']
})
export class SplashComponent implements OnInit, OnDestroy {
  private navigateTimeoutId?: ReturnType<typeof setTimeout>;

  constructor(private router: Router) {}

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
    this.navigateTimeoutId = setTimeout(() => {
      this.router.navigate(['/login']);
    }, 3500);
  }

  ngOnDestroy(): void {
    if (this.navigateTimeoutId) {
      clearTimeout(this.navigateTimeoutId);
    }
  }
}

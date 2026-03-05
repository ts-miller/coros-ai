import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly navLinks = [
    { path: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: 'schedule', label: 'Schedule', icon: 'event' },
    { path: 'predictions', label: 'Predictions', icon: 'trending_up' },
    { path: 'settings', label: 'Settings', icon: 'settings' },
  ];

  constructor() {
    inject(ThemeService).init();
  }
}


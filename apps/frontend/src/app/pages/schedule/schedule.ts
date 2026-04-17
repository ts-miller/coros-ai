import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CorosApiService, WorkoutPlan } from '../../services/coros-api';

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatChipsModule, MatIconModule, MatProgressSpinnerModule, MatExpansionModule, MatSnackBarModule],
  templateUrl: './schedule.html',
  styleUrl: './schedule.scss',
})
export class Schedule implements OnInit {
  private readonly api = inject(CorosApiService);
  private readonly snack = inject(MatSnackBar);

  loading = signal(true);
  error = signal<string | null>(null);
  plans = signal<WorkoutPlan[]>([]);
  pushing = signal(false);
  generating = signal(false);
  unitSystem = signal<'metric' | 'imperial'>('metric');

  ngOnInit(): void {
    this.api.getSettings().subscribe(settings => {
      if (settings) this.unitSystem.set(settings.unitSystem);
      this.loadSchedule();
    });
  }

  loadSchedule(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getSchedule().subscribe({
      next: (plans) => { this.plans.set(plans); this.loading.set(false); },
      error: (e: Error) => {
        this.error.set(e.message);
        this.loading.set(false);
        this.snack.open(e.message, 'OK', { duration: 5000, panelClass: 'error-snackbar' });
      },
    });
  }

  generate(): void {
    this.generating.set(true);
    this.api.triggerGenerate().subscribe({
      next: () => {
        this.error.set(null);
        this.generating.set(false);
        this.loadSchedule();
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.generating.set(false);
        this.snack.open(e.message, 'OK', { duration: 5000, panelClass: 'error-snackbar' });
      },
    });
  }

  push(): void {
    this.pushing.set(true);
    this.api.triggerPush().subscribe({
      next: () => {
        this.error.set(null);
        this.pushing.set(false);
        this.loadSchedule();
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.pushing.set(false);
        this.snack.open(e.message, 'OK', { duration: 5000, panelClass: 'error-snackbar' });
      },
    });
  }

  formatDateInt(d: number): string {
    const s = String(d);
    return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  formatDistance(meters: number | undefined): string {
    if (meters === undefined) return '';
    if (this.unitSystem() === 'imperial') {
      const miles = meters / 1609.344;
      return `${miles.toFixed(2)} mi`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
  }

  formatPace(s: number | null | undefined): string {
    if (!s) return '—';
    let pace = s;
    let unit = 'km';
    if (this.unitSystem() === 'imperial') {
      pace = s * 1.609344;
      unit = 'mi';
    }
    const mins = Math.floor(pace / 60);
    const secs = Math.round(pace % 60);
    return `${mins}:${String(secs).padStart(2, '0')}/${unit}`;
  }

  statusColor(status: string): string {
    return ({ PENDING: 'accent', PUSHED: 'primary', FAILED: 'warn', SKIPPED: '' } as Record<string,string>)[status] ?? '';
  }
}

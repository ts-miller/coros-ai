import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { CorosApiService, WorkoutPlan } from '../../services/coros-api';

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatChipsModule, MatIconModule, MatProgressSpinnerModule, MatExpansionModule],
  templateUrl: './schedule.html',
  styleUrl: './schedule.scss',
})
export class Schedule implements OnInit {
  private readonly api = inject(CorosApiService);

  loading = signal(true);
  error = signal<string | null>(null);
  plans = signal<WorkoutPlan[]>([]);
  pushing = signal(false);
  generating = signal(false);

  ngOnInit(): void { this.loadSchedule(); }

  loadSchedule(): void {
    this.loading.set(true);
    this.api.getSchedule().subscribe({
      next: (plans) => { this.plans.set(plans); this.loading.set(false); },
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  generate(): void {
    this.generating.set(true);
    this.api.triggerGenerate().subscribe({
      next: () => { this.generating.set(false); this.loadSchedule(); },
      error: (e: Error) => { this.error.set(e.message); this.generating.set(false); },
    });
  }

  push(): void {
    this.pushing.set(true);
    this.api.triggerPush().subscribe({
      next: () => { this.pushing.set(false); this.loadSchedule(); },
      error: (e: Error) => { this.error.set(e.message); this.pushing.set(false); },
    });
  }

  formatDateInt(d: number): string {
    const s = String(d);
    return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  formatPace(s: number | null | undefined): string { if (!s) return '—'; return `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}/km`; }

  statusColor(status: string): string {
    return ({ PENDING: 'accent', PUSHED: 'primary', FAILED: 'warn', SKIPPED: '' } as Record<string,string>)[status] ?? '';
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, Chart, CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { forkJoin } from 'rxjs';
import { CorosApiService, Activity, HealthMetric, ActivitySummary } from '../../services/coros-api';

Chart.register(CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, Title, Tooltip, Legend);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatProgressSpinnerModule, MatIconModule, BaseChartDirective],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly api = inject(CorosApiService);

  loading = signal(true);
  error = signal<string | null>(null);
  activities = signal<Activity[]>([]);
  healthMetrics = signal<HealthMetric[]>([]);
  summary = signal<ActivitySummary | null>(null);
  mockDisclaimer = signal<string | null>(null);
  unitSystem = signal<'metric' | 'imperial'>('metric');

  trainingLoadChart: ChartData<'bar'> = { labels: [], datasets: [] };
  sleepChart: ChartData<'line'> = { labels: [], datasets: [] };

  chartOptions: ChartOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } },
  };

  ngOnInit(): void { this.loadData(); }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      acts: this.api.getActivities(30),
      health: this.api.getHealth(30),
      settings: this.api.getSettings(),
    }).subscribe({
      next: ({ acts, health, settings }) => {
        console.log(acts.activities);
        this.unitSystem.set(settings?.unitSystem ?? 'metric');
        this.activities.set(acts.activities);
        this.summary.set(acts.summary);
        this.buildTrainingLoadChart(acts.activities);
        this.healthMetrics.set(health.metrics);
        this.mockDisclaimer.set(health.mockDataDisclaimer);
        this.buildSleepChart(health.metrics);
        this.loading.set(false);
      },
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  private buildTrainingLoadChart(activities: Activity[]): void {
    const sorted = [...activities].reverse().slice(-14);
    this.trainingLoadChart = {
      labels: sorted.map((a) => this.formatDate(a.date)),
      datasets: [{ label: 'Training Load', data: sorted.map((a) => a.trainingLoad ?? 0), backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 4 }],
    };
  }

  private buildSleepChart(metrics: HealthMetric[]): void {
    const sorted = [...metrics].reverse().slice(-14);
    this.sleepChart = {
      labels: sorted.map((m) => this.formatDate(m.date)),
      datasets: [{ label: 'Sleep (hrs)', data: sorted.map((m) => m.sleepDuration ?? 0), borderColor: 'rgba(16,185,129,1)', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4 }],
    };
  }

  get distanceUnit(): string { return this.unitSystem() === 'imperial' ? 'mi' : 'km'; }

  get totalDistance(): string {
    const km = this.summary()?.totalDistanceKm ?? 0;
    return this.unitSystem() === 'imperial' ? (km * 0.621371).toFixed(1) : km.toFixed(1);
  }

  formatDate(d: number): string { const s = String(d); return `${s.slice(4,6)}/${s.slice(6,8)}`; }

  formatPace(secsPerKm: number | null): string {
    if (!secsPerKm) return '—';
    const secs = this.unitSystem() === 'imperial' ? secsPerKm * 1.60934 : secsPerKm;
    const unit = this.unitSystem() === 'imperial' ? '/mi' : '/km';
    return `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}${unit}`;
  }

  formatDistance(meters: number): string {
    if (this.unitSystem() === 'imperial') {
      return (meters / 1609.344).toFixed(2) + ' mi';
    }
    return (meters / 1000).toFixed(1) + ' km';
  }

  sportTypeName(t: number): string { return ({100:'Run',101:'Indoor Run',102:'Trail',103:'Track'} as Record<number,string>)[t] ?? 'Run'; }
}

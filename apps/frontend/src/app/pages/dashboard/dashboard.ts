import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, Chart, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { CorosApiService, Activity, HealthMetric, ActivitySummary } from '../../services/coros-api';

Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

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
    this.api.getActivities(30).subscribe({
      next: ({ activities, summary }) => {
        this.activities.set(activities);
        this.summary.set(summary);
        this.buildTrainingLoadChart(activities);
      },
      error: (e: Error) => this.error.set(e.message),
    });
    this.api.getHealth(30).subscribe({
      next: ({ metrics, mockDataDisclaimer }) => {
        this.healthMetrics.set(metrics);
        this.mockDisclaimer.set(mockDataDisclaimer);
        this.buildSleepChart(metrics);
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

  formatDate(d: number): string { const s = String(d); return `${s.slice(4,6)}/${s.slice(6,8)}`; }
  formatPace(s: number | null): string { if (!s) return '—'; return `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}/km`; }
  formatDistance(m: number): string { return (m/1000).toFixed(1)+' km'; }
  sportTypeName(t: number): string { return ({100:'Run',101:'Indoor Run',102:'Trail',103:'Track'} as Record<number,string>)[t] ?? 'Run'; }
}

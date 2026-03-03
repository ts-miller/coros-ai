import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { CorosApiService, RacePredictions } from '../../services/coros-api';

@Component({
  selector: 'app-predictions',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './predictions.html',
  styleUrl: './predictions.scss',
})
export class Predictions implements OnInit {
  private readonly api = inject(CorosApiService);

  loading = signal(true);
  error = signal<string | null>(null);
  predictions = signal<RacePredictions | null>(null);

  readonly races = [
    { key: 'fiveK' as const, label: '5K' },
    { key: 'tenK' as const, label: '10K' },
    { key: 'halfMarathon' as const, label: 'Half Marathon' },
    { key: 'marathon' as const, label: 'Marathon' },
  ];

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getPredictions().subscribe({
      next: (p) => { this.predictions.set(p); this.loading.set(false); },
      error: (e: Error) => { this.error.set(e.message); this.loading.set(false); },
    });
  }

  formatTs(iso: string): string {
    return new Date(iso).toLocaleString();
  }
}

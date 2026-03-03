import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CorosApiService, AppSettings } from '../../services/coros-api';

const GOALS = ['Base Building', 'Sub-2 Hour Half Marathon', 'Sub-20 min 5K', 'Sub-45 min 10K', 'Marathon PR', 'Custom'];

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatNativeDateModule, MatProgressSpinnerModule, MatDividerModule, MatIconModule, MatSnackBarModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  private readonly api = inject(CorosApiService);
  private readonly snack = inject(MatSnackBar);

  goals = GOALS;
  loading = signal(true);
  saving = signal(false);
  syncing = signal(false);
  generating = signal(false);
  pushing = signal(false);
  error = signal<string | null>(null);

  form = {
    corosEmail: '',
    corosPassword: '',
    goal: 'Base Building',
    goalDate: null as Date | null,
  };

  ngOnInit(): void {
    this.api.getSettings().subscribe({
      next: (s) => {
        if (s) {
          this.form.corosEmail = s.corosEmail ?? '';
          this.form.goal = s.goal;
          this.form.goalDate = s.goalDate ? new Date(s.goalDate) : null;
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  save(): void {
    this.saving.set(true);
    const payload: Parameters<CorosApiService['saveSettings']>[0] = {
      goal: this.form.goal,
      goalDate: this.form.goalDate?.toISOString().slice(0, 10),
      corosEmail: this.form.corosEmail,
      ...(this.form.corosPassword ? { corosPassword: this.form.corosPassword } : {}),
    };
    this.api.saveSettings(payload).subscribe({
      next: () => { this.saving.set(false); this.snack.open('Settings saved!', 'OK', { duration: 3000 }); },
      error: (e: Error) => { this.error.set(e.message); this.saving.set(false); },
    });
  }

  sync(): void {
    this.syncing.set(true);
    this.api.triggerSync().subscribe({
      next: (r) => { this.syncing.set(false); this.snack.open(`Synced ${r.synced} activities`, 'OK', { duration: 4000 }); },
      error: (e: Error) => { this.error.set(e.message); this.syncing.set(false); },
    });
  }

  generate(): void {
    this.generating.set(true);
    this.api.triggerGenerate().subscribe({
      next: (r) => { this.generating.set(false); this.snack.open(`Generated ${r.generated} workouts`, 'OK', { duration: 4000 }); },
      error: (e: Error) => { this.error.set(e.message); this.generating.set(false); },
    });
  }

  push(): void {
    this.pushing.set(true);
    this.api.triggerPush().subscribe({
      next: (r) => { this.pushing.set(false); this.snack.open(`Pushed ${r.pushed}, failed ${r.failed}`, 'OK', { duration: 4000 }); },
      error: (e: Error) => { this.error.set(e.message); this.pushing.set(false); },
    });
  }
}

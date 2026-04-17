import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { CorosApiService, AppSettings, Goal, GoalType, RaceDistance, ExperienceLevel, GoalPayload } from '../../services/coros-api';
import { ThemeService, Theme } from '../../services/theme.service';

interface RaceDistanceOption {
  value: RaceDistance;
  label: string;
}

const RACE_DISTANCES: RaceDistanceOption[] = [
  { value: '5K',           label: '5K' },
  { value: '10K',          label: '10K' },
  { value: 'HALF_MARATHON', label: 'Half Marathon' },
  { value: 'MARATHON',     label: 'Marathon' },
  { value: '50K',          label: '50K' },
  { value: '50_MILE',      label: '50 Mile' },
  { value: '100K',         label: '100K' },
  { value: '100_MILE',     label: '100 Mile' },
];

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatButtonToggleModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, MatDividerModule,
    MatIconModule, MatSlideToggleModule,
    MatSnackBarModule, MatChipsModule,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  private readonly api = inject(CorosApiService);
  private readonly snack = inject(MatSnackBar);
  readonly themeService = inject(ThemeService);

  readonly raceDistances = RACE_DISTANCES;

  loading = signal(true);
  saving = signal(false);
  savingGoal = signal(false);
  syncing = signal(false);
  generating = signal(false);
  pushing = signal(false);
  error = signal<string | null>(null);

  // ─── Settings form ─────────────────────────────────────────────────────────
  settingsForm = {
    corosEmail: '',
    corosPassword: '',
    unitSystem: 'metric' as 'metric' | 'imperial',
  };

  // ─── Goal form ─────────────────────────────────────────────────────────────
  goalForm = {
    goalType: 'BASE_BUILDING' as GoalType,
    raceDistance: 'HALF_MARATHON' as RaceDistance,
    raceDate: null as Date | null,
    targetHours: null as number | null,
    targetMinutes: null as number | null,
    targetSeconds: null as number | null,
    experienceLevel: 'INTERMEDIATE' as ExperienceLevel,
    daysPerWeek: 4,
  };

  get imperialToggle(): boolean {
    return this.settingsForm.unitSystem === 'imperial';
  }

  onUnitToggle(isImperial: boolean): void {
    this.settingsForm.unitSystem = isImperial ? 'imperial' : 'metric';
    this.saveSettings();
  }

  onThemeChange(t: Theme): void {
    this.themeService.setTheme(t);
  }

  ngOnInit(): void {
    forkJoin({
      settings: this.api.getSettings(),
      goal: this.api.getGoal(),
    }).subscribe({
      next: ({ settings, goal }) => {
        if (settings) {
          this.settingsForm.corosEmail = settings.corosEmail ?? '';
          this.settingsForm.unitSystem = settings.unitSystem ?? 'metric';
        }
        if (goal) {
          this.goalForm.goalType = goal.goalType;
          this.goalForm.raceDistance = goal.raceDistance ?? 'HALF_MARATHON';
          this.goalForm.raceDate = goal.raceDate ? new Date(goal.raceDate) : null;
          this.goalForm.experienceLevel = goal.experienceLevel;
          this.goalForm.daysPerWeek = goal.daysPerWeek;
          if (goal.targetTimeSeconds) {
            this.goalForm.targetHours   = Math.floor(goal.targetTimeSeconds / 3600);
            this.goalForm.targetMinutes = Math.floor((goal.targetTimeSeconds % 3600) / 60);
            this.goalForm.targetSeconds = goal.targetTimeSeconds % 60;
          }
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  saveSettings(): void {
    this.saving.set(true);
    const payload: Parameters<CorosApiService['saveSettings']>[0] = {
      corosEmail: this.settingsForm.corosEmail,
      unitSystem: this.settingsForm.unitSystem,
      ...(this.settingsForm.corosPassword ? { corosPassword: this.settingsForm.corosPassword } : {}),
    };
    this.api.saveSettings(payload).subscribe({
      next: () => {
        this.error.set(null);
        this.saving.set(false);
        this.snack.open('Settings saved!', 'OK', { duration: 3000 });
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.saving.set(false);
        this.snack.open(e.message, 'OK', { duration: 5000, panelClass: 'error-snackbar' });
      },
    });
  }

  saveGoal(): void {
    const f = this.goalForm;

    // Compute targetTimeSeconds from h/m/s fields
    let targetTimeSeconds: number | null = null;
    const h = Number(f.targetHours ?? 0);
    const m = Number(f.targetMinutes ?? 0);
    const s = Number(f.targetSeconds ?? 0);
    if (h > 0 || m > 0 || s > 0) {
      targetTimeSeconds = h * 3600 + m * 60 + s;
    }

    const payload: GoalPayload = {
      goalType: f.goalType,
      raceDistance: f.goalType === 'RACE' ? f.raceDistance : null,
      targetTimeSeconds,
      raceDate: f.goalType === 'RACE' && f.raceDate
        ? f.raceDate.toISOString().slice(0, 10)
        : null,
      experienceLevel: f.experienceLevel,
      daysPerWeek: f.daysPerWeek,
    };

    this.savingGoal.set(true);
    this.api.saveGoal(payload).subscribe({
      next: () => {
        this.error.set(null);
        this.savingGoal.set(false);
        this.snack.open('Goal saved!', 'OK', { duration: 3000 });
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.savingGoal.set(false);
        this.snack.open(e.message, 'OK', { duration: 5000, panelClass: 'error-snackbar' });
      },
    });
  }

  sync(): void {
    this.syncing.set(true);
    this.api.triggerSync().subscribe({
      next: (r) => {
        this.error.set(null);
        this.syncing.set(false);
        this.snack.open(`Synced ${r.synced} activities`, 'OK', { duration: 4000 });
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.syncing.set(false);
        this.snack.open(e.message, 'OK', { duration: 5000, panelClass: 'error-snackbar' });
      },
    });
  }

  generate(): void {
    this.generating.set(true);
    this.api.triggerGenerate().subscribe({
      next: (r) => {
        this.error.set(null);
        this.generating.set(false);
        this.snack.open(`Generated ${r.generated} workouts`, 'OK', { duration: 4000 });
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
      next: (r) => {
        this.error.set(null);
        this.pushing.set(false);
        this.snack.open(`Pushed ${r.pushed}, failed ${r.failed}`, 'OK', { duration: 4000 });
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.pushing.set(false);
        this.snack.open(e.message, 'OK', { duration: 5000, panelClass: 'error-snackbar' });
      },
    });
  }
}


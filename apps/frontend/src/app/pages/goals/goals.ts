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
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CorosApiService, Goal, GoalType, RaceDistance, ExperienceLevel, GoalValidationResult, ProgressStatus } from '../../services/coros-api';

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
  selector: 'app-goals',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, MatDividerModule,
    MatIconModule, MatSnackBarModule, MatChipsModule,
    MatProgressBarModule, MatDialogModule
  ],
  templateUrl: './goals.html',
  styleUrl: './goals.scss',
})
export class Goals implements OnInit {
  private readonly api = inject(CorosApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly raceDistances = RACE_DISTANCES;

  loading = signal(true);
  saving = signal(false);
  activeGoals = signal<Goal[]>([]);
  pastGoals = signal<Goal[]>([]);
  showForm = signal(false);
  selectedTab = signal<'current' | 'past'>('current');

  // ─── Goal form ─────────────────────────────────────────────────────────────
  goalForm = {
    id: null as string | null,
    title: '',
    goalType: 'RACE' as GoalType,
    isPrimary: true,
    raceDistance: 'HALF_MARATHON' as RaceDistance,
    raceDate: null as Date | null,
    targetHours: null as number | null,
    targetMinutes: null as number | null,
    targetSeconds: null as number | null,
    experienceLevel: 'INTERMEDIATE' as ExperienceLevel,
    daysPerWeek: 4,
    aiWarningIgnored: false,
  };

  ngOnInit(): void {
    this.loadGoals();
  }

  loadGoals(): void {
    this.loading.set(true);
    this.api.getGoals().subscribe({
      next: (goals) => {
        this.activeGoals.set(goals.filter(g => g.status === 'ACTIVE'));
        this.pastGoals.set(goals.filter(g => g.status !== 'ACTIVE'));
        this.loading.set(false);
      },
      error: (e) => {
        this.snack.open(e.message, 'OK', { duration: 5000 });
        this.loading.set(false);
      }
    });
  }

  resetForm(): void {
    this.goalForm = {
      id: null,
      title: '',
      goalType: 'RACE',
      isPrimary: this.activeGoals().length === 0,
      raceDistance: 'HALF_MARATHON',
      raceDate: null,
      targetHours: null,
      targetMinutes: null,
      targetSeconds: null,
      experienceLevel: 'INTERMEDIATE',
      daysPerWeek: 4,
      aiWarningIgnored: false,
    };
    this.showForm.set(true);
  }

  editGoal(goal: Goal): void {
    this.goalForm = {
      id: goal.id,
      title: goal.title,
      goalType: goal.type,
      isPrimary: goal.isPrimary,
      raceDistance: goal.raceDistance ?? 'HALF_MARATHON',
      raceDate: goal.targetDate ? new Date(goal.targetDate) : null,
      experienceLevel: goal.experienceLevel,
      daysPerWeek: goal.trainingDaysPerWeek,
      aiWarningIgnored: goal.aiWarningIgnored,
      targetHours: goal.targetTimeSeconds ? Math.floor(goal.targetTimeSeconds / 3600) : null,
      targetMinutes: goal.targetTimeSeconds ? Math.floor((goal.targetTimeSeconds % 3600) / 60) : null,
      targetSeconds: goal.targetTimeSeconds ? goal.targetTimeSeconds % 60 : null,
    };
    this.showForm.set(true);
  }

  saveGoal(ignoreWarning = false): void {
    const f = this.goalForm;
    let targetTimeSeconds: number | null = null;
    const h = Number(f.targetHours ?? 0);
    const m = Number(f.targetMinutes ?? 0);
    const s = Number(f.targetSeconds ?? 0);
    if (h > 0 || m > 0 || s > 0) {
      targetTimeSeconds = h * 3600 + m * 60 + s;
    }

    const payload: Partial<Goal> = {
      title: f.title,
      type: f.goalType,
      isPrimary: f.isPrimary,
      raceDistance: (f.goalType === 'RACE' || f.goalType === 'PACE' || f.goalType === 'DISTANCE') ? f.raceDistance : null,
      targetTimeSeconds,
      targetDate: f.raceDate ? f.raceDate.toISOString() : null,
      experienceLevel: f.experienceLevel,
      trainingDaysPerWeek: f.daysPerWeek,
      aiWarningIgnored: ignoreWarning || f.aiWarningIgnored,
    };

    if (!ignoreWarning && f.isPrimary && (f.goalType === 'RACE' || f.goalType === 'PACE')) {
      this.saving.set(true);
      this.api.validateGoal(payload).subscribe({
        next: (result) => {
          if (!result.isAttainable) {
            this.showValidationWarning(result, payload);
          } else {
            this.executeSave(payload);
          }
        },
        error: () => this.executeSave(payload) // Fail open
      });
    } else {
      this.executeSave(payload);
    }
  }

  private executeSave(payload: Partial<Goal>): void {
    this.saving.set(true);
    const obs = this.goalForm.id
      ? this.api.updateGoal(this.goalForm.id, payload)
      : this.api.createGoal(payload);

    obs.subscribe({
      next: () => {
        this.snack.open('Goal saved!', 'OK', { duration: 3000 });
        this.showForm.set(false);
        this.loadGoals();
        this.saving.set(false);
      },
      error: (e) => {
        this.snack.open(e.message, 'OK', { duration: 5000 });
        this.saving.set(false);
      }
    });
  }

  private showValidationWarning(result: GoalValidationResult, payload: Partial<Goal>): void {
    this.saving.set(false);
    // In a real app we'd use a MatDialog. For brevity in this prototype,
    // we'll use a confirm with the warning message.
    const msg = `AI COACH WARNING: ${result.warningMessage}\n\nRecommendation: ${result.recommendation}\n\nDo you want to save anyway?`;
    if (confirm(msg)) {
      this.executeSave({ ...payload, aiWarningIgnored: true });
    }
  }

  deleteGoal(id: string): void {
    if (confirm('Are you sure you want to archive this goal?')) {
      this.api.deleteGoal(id).subscribe({
        next: () => {
          this.snack.open('Goal archived', 'OK', { duration: 3000 });
          this.loadGoals();
        }
      });
    }
  }

  getProgressColor(status: ProgressStatus): string {
    switch (status) {
      case 'ON_TRACK': return 'accent';
      case 'FALLING_BEHIND': return 'warn';
      case 'AHEAD': return 'primary';
      default: return '';
    }
  }

  getProgressLabel(status: ProgressStatus): string {
    switch (status) {
      case 'ON_TRACK': return '🟢 On Track';
      case 'FALLING_BEHIND': return '🟡 Falling Behind';
      case 'AHEAD': return '🔵 Ahead of Schedule';
      default: return '⚪ Not Evaluated';
    }
  }
}

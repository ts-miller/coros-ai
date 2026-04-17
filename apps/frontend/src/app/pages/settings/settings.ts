import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CorosApiService } from '../../services/coros-api';
import { ThemeService, Theme } from '../../services/theme.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatButtonToggleModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatProgressSpinnerModule, MatDividerModule,
    MatIconModule, MatSlideToggleModule,
    MatSnackBarModule,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  private readonly api = inject(CorosApiService);
  private readonly snack = inject(MatSnackBar);
  readonly themeService = inject(ThemeService);

  loading = signal(true);
  saving = signal(false);
  syncing = signal(false);
  generating = signal(false);
  pushing = signal(false);
  error = signal<string | null>(null);

  settingsForm = {
    corosEmail: '',
    corosPassword: '',
    unitSystem: 'metric' as 'metric' | 'imperial',
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
    this.api.getSettings().subscribe({
      next: (settings) => {
        if (settings) {
          this.settingsForm.corosEmail = settings.corosEmail ?? '';
          this.settingsForm.unitSystem = settings.unitSystem ?? 'metric';
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
        this.snack.open(`Synced ${r.pushed}, failed ${r.failed}`, 'OK', { duration: 4000 });
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.pushing.set(false);
        this.snack.open(e.message, 'OK', { duration: 5000, panelClass: 'error-snackbar' });
      },
    });
  }
}

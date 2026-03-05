import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'appTheme';
const THEME_CLASSES: Theme[] = ['light', 'dark', 'system'];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('dark');

  init(): void {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const resolved: Theme =
      stored && THEME_CLASSES.includes(stored) ? stored : 'dark';
    this.theme.set(resolved);
    this.applyToDOM(resolved);
  }

  setTheme(t: Theme): void {
    this.theme.set(t);
    localStorage.setItem(STORAGE_KEY, t);
    this.applyToDOM(t);
  }

  private applyToDOM(t: Theme): void {
    const cl = document.documentElement.classList;
    THEME_CLASSES.forEach((c) => cl.remove(`${c}-theme`));
    cl.add(`${t}-theme`);
  }
}

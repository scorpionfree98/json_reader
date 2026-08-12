import type { WorkbenchMode } from './workbenchController';

export type AppTheme = 'light' | 'dark';

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SettingsLogger {
  warn(message: string, error: unknown): void;
}

const SETTINGS_KEYS = {
  theme: 'json_formatter_theme',
  viewMode: 'json_formatter_view_mode',
  updateDisabled: 'json_formatter_update_disabled'
} as const;

const defaultLogger: SettingsLogger = {
  warn: (message, error) => console.warn(message, error)
};

const getBrowserStorage = (): SettingsStorage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export class SettingsStore {
  constructor(
    private readonly storage: SettingsStorage | null = getBrowserStorage(),
    private readonly logger: SettingsLogger = defaultLogger
  ) {}

  getTheme(): AppTheme {
    const value = this.read(SETTINGS_KEYS.theme);
    return value === 'dark' ? 'dark' : 'light';
  }

  setTheme(theme: AppTheme): void {
    this.write(SETTINGS_KEYS.theme, theme);
  }

  getViewMode(): WorkbenchMode {
    const value = this.read(SETTINGS_KEYS.viewMode);
    return value === 'split' ? 'split' : 'editor';
  }

  setViewMode(mode: WorkbenchMode): void {
    this.write(SETTINGS_KEYS.viewMode, mode);
  }

  getUpdateDisabled(): boolean {
    return this.read(SETTINGS_KEYS.updateDisabled) === 'true';
  }

  setUpdateDisabled(disabled: boolean): void {
    this.write(SETTINGS_KEYS.updateDisabled, String(disabled));
  }

  private read(key: string): string | null {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(key);
    } catch (error) {
      this.logger.warn(`读取设置 ${key} 失败`, error);
      return null;
    }
  }

  private write(key: string, value: string): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(key, value);
    } catch (error) {
      this.logger.warn(`保存设置 ${key} 失败`, error);
    }
  }
}

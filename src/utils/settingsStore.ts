import type { WorkbenchLayout, WorkbenchResultView } from './workbenchController';

export type AppTheme = 'light' | 'dark';

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface SettingsLogger {
  warn(message: string, error: unknown): void;
}

const SETTINGS_KEYS = {
  theme: 'json_formatter_theme',
  layout: 'json_formatter_layout',
  resultView: 'json_formatter_result_view',
  legacyViewMode: 'json_formatter_view_mode',
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
  private viewSettings?: { layout: WorkbenchLayout; resultView: WorkbenchResultView };

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

  getWorkbenchView(): Readonly<{ layout: WorkbenchLayout; resultView: WorkbenchResultView }> {
    if (!this.viewSettings) this.viewSettings = this.loadWorkbenchView();
    return { ...this.viewSettings };
  }

  setLayout(layout: WorkbenchLayout): void {
    const current = this.getWorkbenchView();
    this.viewSettings = { ...current, layout };
    this.write(SETTINGS_KEYS.layout, layout);
  }

  setResultView(resultView: WorkbenchResultView): void {
    const current = this.getWorkbenchView();
    this.viewSettings = { ...current, resultView };
    this.write(SETTINGS_KEYS.resultView, resultView);
  }

  getUpdateDisabled(): boolean {
    return this.read(SETTINGS_KEYS.updateDisabled) === 'true';
  }

  setUpdateDisabled(disabled: boolean): void {
    this.write(SETTINGS_KEYS.updateDisabled, String(disabled));
  }

  private loadWorkbenchView(): { layout: WorkbenchLayout; resultView: WorkbenchResultView } {
    const storedLayout = this.read(SETTINGS_KEYS.layout);
    const storedResultView = this.read(SETTINGS_KEYS.resultView);
    const legacyViewMode = this.read(SETTINGS_KEYS.legacyViewMode);
    const layout: WorkbenchLayout = storedLayout === 'editor' || storedLayout === 'result'
      ? storedLayout
      : 'split';
    const resultView: WorkbenchResultView = storedResultView === 'highlight' || storedResultView === 'tree'
      ? storedResultView
      : legacyViewMode === 'editor' ? 'highlight' : 'tree';

    if (storedLayout !== layout) this.write(SETTINGS_KEYS.layout, layout);
    if (storedResultView !== resultView) this.write(SETTINGS_KEYS.resultView, resultView);
    this.remove(SETTINGS_KEYS.legacyViewMode);
    return { layout, resultView };
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

  private remove(key: string): void {
    if (!this.storage?.removeItem) return;
    try {
      this.storage.removeItem(key);
    } catch (error) {
      this.logger.warn(`删除旧设置 ${key} 失败`, error);
    }
  }
}

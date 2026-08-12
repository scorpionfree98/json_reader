import { SettingsStore, type SettingsLogger, type SettingsStorage } from '../settingsStore';

const createMemoryStorage = (initial: Record<string, string> = {}): SettingsStorage => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }
  };
};

describe('SettingsStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('默认使用浏览器 localStorage', () => {
    const settings = new SettingsStore();
    settings.setTheme('dark');
    settings.setViewMode('split');
    settings.setUpdateDisabled(true);
    expect(new SettingsStore().getTheme()).toBe('dark');
    expect(new SettingsStore().getViewMode()).toBe('split');
    expect(new SettingsStore().getUpdateDisabled()).toBe(true);
  });

  test('没有保存值时返回安全默认值', () => {
    const settings = new SettingsStore(createMemoryStorage());
    expect(settings.getTheme()).toBe('light');
    expect(settings.getViewMode()).toBe('editor');
    expect(settings.getUpdateDisabled()).toBe(false);
  });

  test('保存并读取全部设置', () => {
    const settings = new SettingsStore(createMemoryStorage());
    settings.setTheme('dark');
    settings.setViewMode('split');
    settings.setUpdateDisabled(true);
    expect(settings.getTheme()).toBe('dark');
    expect(settings.getViewMode()).toBe('split');
    expect(settings.getUpdateDisabled()).toBe(true);
  });

  test('非法枚举值回退到默认值', () => {
    const settings = new SettingsStore(createMemoryStorage({
      json_formatter_theme: 'sepia',
      json_formatter_view_mode: 'unknown',
      json_formatter_update_disabled: 'yes'
    }));
    expect(settings.getTheme()).toBe('light');
    expect(settings.getViewMode()).toBe('editor');
    expect(settings.getUpdateDisabled()).toBe(false);
  });

  test('读取失败时记录警告并返回默认值', () => {
    const error = new Error('read failed');
    const storage: SettingsStorage = {
      getItem: () => { throw error; },
      setItem: () => undefined
    };
    const logger: SettingsLogger = { warn: jest.fn() };
    const settings = new SettingsStore(storage, logger);
    expect(settings.getTheme()).toBe('light');
    expect(settings.getViewMode()).toBe('editor');
    expect(settings.getUpdateDisabled()).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('读取设置'), error);
  });

  test('写入失败时记录警告且不抛出', () => {
    const error = new Error('write failed');
    const storage: SettingsStorage = {
      getItem: () => null,
      setItem: () => { throw error; }
    };
    const logger: SettingsLogger = { warn: jest.fn() };
    const settings = new SettingsStore(storage, logger);
    expect(() => {
      settings.setTheme('dark');
      settings.setViewMode('split');
      settings.setUpdateDisabled(true);
    }).not.toThrow();
    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('保存设置'), error);
  });

  test('没有可用存储时读写保持安全', () => {
    const settings = new SettingsStore(null);
    expect(settings.getTheme()).toBe('light');
    expect(settings.getViewMode()).toBe('editor');
    expect(settings.getUpdateDisabled()).toBe(false);
    expect(() => settings.setTheme('dark')).not.toThrow();
  });

  test('浏览器拒绝访问 localStorage 时回退为空存储', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('storage blocked'); }
    });
    try {
      const settings = new SettingsStore();
      expect(settings.getTheme()).toBe('light');
      expect(() => settings.setTheme('dark')).not.toThrow();
    } finally {
      if (descriptor) Object.defineProperty(window, 'localStorage', descriptor);
    }
  });

  test('默认日志器记录存储异常', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = new Error('storage failed');
    const storage: SettingsStorage = {
      getItem: () => { throw error; },
      setItem: () => { throw error; }
    };
    const settings = new SettingsStore(storage);
    expect(settings.getTheme()).toBe('light');
    settings.setTheme('dark');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

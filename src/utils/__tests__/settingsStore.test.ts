import { SettingsStore, type SettingsLogger, type SettingsStorage } from '../settingsStore';

const createMemoryStorage = (initial: Record<string, string> = {}): SettingsStorage => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); }
  };
};

describe('SettingsStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('默认使用浏览器 localStorage', () => {
    const settings = new SettingsStore();
    settings.setTheme('dark');
    settings.setLayout('result');
    settings.setResultView('highlight');
    settings.setUpdateDisabled(true);
    expect(new SettingsStore().getTheme()).toBe('dark');
    expect(new SettingsStore().getWorkbenchView()).toEqual({ layout: 'result', resultView: 'highlight' });
    expect(new SettingsStore().getUpdateDisabled()).toBe(true);
  });

  test('没有保存值时返回安全默认值', () => {
    const settings = new SettingsStore(createMemoryStorage());
    expect(settings.getTheme()).toBe('light');
    expect(settings.getWorkbenchView()).toEqual({ layout: 'split', resultView: 'tree' });
    expect(settings.getUpdateDisabled()).toBe(false);
  });

  test('保存并读取全部设置', () => {
    const settings = new SettingsStore(createMemoryStorage());
    settings.setTheme('dark');
    settings.setLayout('editor');
    settings.setResultView('highlight');
    settings.setUpdateDisabled(true);
    expect(settings.getTheme()).toBe('dark');
    expect(settings.getWorkbenchView()).toEqual({ layout: 'editor', resultView: 'highlight' });
    expect(settings.getUpdateDisabled()).toBe(true);
  });

  test('非法枚举值回退到默认值', () => {
    const settings = new SettingsStore(createMemoryStorage({
      json_formatter_theme: 'sepia',
      json_formatter_layout: 'unknown',
      json_formatter_result_view: 'unknown',
      json_formatter_update_disabled: 'yes'
    }));
    expect(settings.getTheme()).toBe('light');
    expect(settings.getWorkbenchView()).toEqual({ layout: 'split', resultView: 'tree' });
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
    expect(settings.getWorkbenchView()).toEqual({ layout: 'split', resultView: 'tree' });
    expect(settings.getUpdateDisabled()).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(5);
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
      settings.setLayout('result');
      settings.setResultView('highlight');
      settings.setUpdateDisabled(true);
    }).not.toThrow();
    expect(logger.warn).toHaveBeenCalledTimes(6);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('保存设置'), error);
  });

  test('没有可用存储时读写保持安全', () => {
    const settings = new SettingsStore(null);
    expect(settings.getTheme()).toBe('light');
    expect(settings.getWorkbenchView()).toEqual({ layout: 'split', resultView: 'tree' });
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

  test.each([
    ['editor', { layout: 'split', resultView: 'highlight' }],
    ['split', { layout: 'split', resultView: 'tree' }]
  ])('迁移旧视图模式 %s', (legacyViewMode, expected) => {
    const values = new Map<string, string>([['json_formatter_view_mode', legacyViewMode]]);
    const storage: SettingsStorage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); }
    };
    const settings = new SettingsStore(storage);

    expect(settings.getWorkbenchView()).toEqual(expected);
    expect(values.get('json_formatter_layout')).toBe('split');
    expect(values.get('json_formatter_result_view')).toBe(expected.resultView);
    expect(values.has('json_formatter_view_mode')).toBe(false);
  });

  test('新工作台设置优先于旧视图模式', () => {
    const settings = new SettingsStore(createMemoryStorage({
      json_formatter_layout: 'result',
      json_formatter_result_view: 'tree',
      json_formatter_view_mode: 'editor'
    }));

    expect(settings.getWorkbenchView()).toEqual({ layout: 'result', resultView: 'tree' });
  });
});

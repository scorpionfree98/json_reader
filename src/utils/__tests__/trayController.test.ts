import {
  TrayController,
  type TrayControllerOptions,
  type TrayEvent,
  type TrayHandlers,
  type TrayListen,
  type Unlisten
} from '../trayController';

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

const createHarness = (overrides: Partial<TrayControllerOptions> = {}) => {
  const listeners = new Map<string, (event: TrayEvent<unknown>) => void>();
  const unlisteners: jest.Mock<void, []>[] = [];
  const listen: TrayListen = jest.fn(async (event, handler) => {
    listeners.set(event, handler as (event: TrayEvent<unknown>) => void);
    const unlisten = jest.fn(() => { listeners.delete(event); });
    unlisteners.push(unlisten);
    return unlisten;
  });
  const handlers: jest.Mocked<TrayHandlers> = {
    checkUpdates: jest.fn(),
    showWindow: jest.fn(),
    hideWindow: jest.fn(),
    setAlwaysOnTop: jest.fn(),
    setAutostart: jest.fn(),
    setUpdateDisabled: jest.fn()
  };
  const options: TrayControllerOptions = {
    isTauri: () => true,
    listen,
    handlers,
    log: jest.fn(),
    ...overrides
  };
  return { options, listeners, unlisteners, handlers };
};

describe('TrayController', () => {
  test('浏览器环境不注册监听', async () => {
    const { options } = createHarness({ isTauri: () => false });
    await new TrayController(options).init();
    expect(options.listen).not.toHaveBeenCalled();
  });

  test('注册全部托盘事件并转发载荷', async () => {
    const { options, listeners, handlers } = createHarness();
    await new TrayController(options).init();
    expect(options.listen).toHaveBeenCalledTimes(6);

    listeners.get('tray://check-updates')?.({ payload: undefined });
    listeners.get('tray://show')?.({ payload: undefined });
    listeners.get('tray://hide')?.({ payload: undefined });
    listeners.get('tray://toggle-always-on-top')?.({ payload: true });
    listeners.get('tray://toggle-autostart')?.({ payload: false });
    listeners.get('tray://toggle-disable-update')?.({ payload: 1 });
    await flushPromises();

    expect(handlers.checkUpdates).toHaveBeenCalledTimes(1);
    expect(handlers.showWindow).toHaveBeenCalledTimes(1);
    expect(handlers.hideWindow).toHaveBeenCalledTimes(1);
    expect(handlers.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(handlers.setAutostart).toHaveBeenCalledWith(false);
    expect(handlers.setUpdateDisabled).toHaveBeenCalledWith(true);
  });

  test('重复初始化先清理旧监听', async () => {
    const { options, unlisteners } = createHarness();
    const controller = new TrayController(options);
    await controller.init();
    const firstGeneration = unlisteners.slice();
    await controller.init();
    firstGeneration.forEach(unlisten => expect(unlisten).toHaveBeenCalledTimes(1));
    expect(options.listen).toHaveBeenCalledTimes(12);
  });

  test('注册中途失败时回滚已注册监听', async () => {
    const error = new Error('listen failed');
    const unlisten = jest.fn();
    const listen = jest.fn()
      .mockResolvedValueOnce(unlisten)
      .mockRejectedValueOnce(error) as TrayListen;
    const { options } = createHarness({ listen });
    await new TrayController(options).init();
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(options.log).toHaveBeenCalledWith('注册托盘监听失败', error);
  });

  test('清理异常被记录且不阻止其他监听清理', async () => {
    const error = new Error('dispose failed');
    const first = jest.fn(() => { throw error; });
    const second = jest.fn();
    const listen = jest.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValue(second) as TrayListen;
    const { options } = createHarness({ listen });
    const controller = new TrayController(options);
    await controller.init();
    await controller.dispose();
    expect(options.log).toHaveBeenCalledWith('清理托盘监听失败', error);
    expect(second).toHaveBeenCalled();
  });

  test.each([
    ['同步', () => { throw new Error('sync failed'); }],
    ['异步', () => Promise.reject(new Error('async failed'))]
  ])('%s事件处理异常被捕获', async (_name, failingHandler) => {
    const { options, listeners, handlers } = createHarness();
    handlers.showWindow.mockImplementation(failingHandler);
    await new TrayController(options).init();
    listeners.get('tray://show')?.({ payload: undefined });
    await flushPromises();
    expect(options.log).toHaveBeenCalledWith(
      '处理托盘事件 tray://show 失败',
      expect.any(Error)
    );
  });

  test('初始化被释放时立即清理迟到的监听', async () => {
    let resolveListen: ((unlisten: Unlisten) => void) | undefined;
    const lateUnlisten = jest.fn();
    const listen: TrayListen = jest.fn(() => new Promise(resolve => { resolveListen = resolve; }));
    const { options } = createHarness({ listen });
    const controller = new TrayController(options);
    const initialization = controller.init();
    await flushPromises();
    await controller.dispose();
    resolveListen?.(lateUnlisten);
    await initialization;
    expect(lateUnlisten).toHaveBeenCalledTimes(1);
  });
});

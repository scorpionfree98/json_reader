import {
  UpdateService,
  escapeUpdateHtml,
  type AvailableUpdate,
  type SafeUpdateDetails,
  type UpdateDialogActions,
  type UpdateServiceDependencies
} from '../updateService';

const createDependencies = (overrides: Partial<UpdateServiceDependencies> = {}) => {
  let dialogDetails: SafeUpdateDetails | undefined;
  let dialogActions: UpdateDialogActions | undefined;
  const dependencies: UpdateServiceDependencies = {
    isTauri: () => true,
    isDisabled: () => false,
    checkForUpdate: jest.fn().mockResolvedValue(null),
    getCurrentVersion: jest.fn().mockResolvedValue('1.0.0'),
    relaunch: jest.fn().mockResolvedValue(undefined),
    showMessage: jest.fn(),
    showDialog: jest.fn((details, actions) => {
      dialogDetails = details;
      dialogActions = actions;
    }),
    log: jest.fn(),
    ...overrides
  };
  return {
    dependencies,
    getDialogDetails: () => dialogDetails,
    getDialogActions: () => dialogActions
  };
};

const createUpdate = (overrides: Partial<AvailableUpdate> = {}): AvailableUpdate => ({
  version: '2.0.0',
  body: 'changes',
  downloadAndInstall: jest.fn().mockResolvedValue(undefined),
  ...overrides
});

describe('escapeUpdateHtml', () => {
  test('转义更新信息中的全部 HTML 特殊字符', () => {
    expect(escapeUpdateHtml(`<script data-x="a&b">'x'</script>`))
      .toBe('&lt;script data-x=&quot;a&amp;b&quot;&gt;&#039;x&#039;&lt;/script&gt;');
  });
});

describe('UpdateService', () => {
  test('浏览器模式不调用更新 API', async () => {
    const { dependencies } = createDependencies({ isTauri: () => false });
    await new UpdateService(dependencies).check(true);
    expect(dependencies.showMessage).toHaveBeenCalledWith('更新检查仅在应用模式中可用');
    expect(dependencies.checkForUpdate).not.toHaveBeenCalled();
  });

  test('禁用自动更新时跳过非手动检查', async () => {
    const { dependencies } = createDependencies({ isDisabled: () => true });
    await new UpdateService(dependencies).check(false);
    expect(dependencies.log).toHaveBeenCalledWith('自动更新已禁用，跳过检查');
    expect(dependencies.checkForUpdate).not.toHaveBeenCalled();
  });

  test('手动检查可越过禁用状态并提示已是最新版', async () => {
    const { dependencies } = createDependencies({ isDisabled: () => true });
    await new UpdateService(dependencies).check(true);
    expect(dependencies.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(dependencies.showMessage).toHaveBeenCalledWith('当前已是最新版本');
  });

  test('自动检查无更新时保持静默', async () => {
    const { dependencies } = createDependencies();
    await new UpdateService(dependencies).check();
    expect(dependencies.showMessage).not.toHaveBeenCalled();
  });

  test('发现更新时转义并显示版本信息', async () => {
    const update = createUpdate({ version: '<2.0>', body: '<img onerror="x">' });
    const { dependencies, getDialogDetails } = createDependencies({
      checkForUpdate: jest.fn().mockResolvedValue(update),
      getCurrentVersion: jest.fn().mockResolvedValue('1&0')
    });
    await new UpdateService(dependencies).check(true);
    expect(getDialogDetails()).toEqual({
      currentVersion: '1&amp;0',
      latestVersion: '&lt;2.0&gt;',
      releaseNotes: '&lt;img onerror=&quot;x&quot;&gt;'
    });
  });

  test('缺少版本和日志时显示默认文案', async () => {
    const { dependencies, getDialogDetails } = createDependencies({
      checkForUpdate: jest.fn().mockResolvedValue(createUpdate({ version: '', body: '' }))
    });
    await new UpdateService(dependencies).check();
    expect(getDialogDetails()).toMatchObject({ latestVersion: '未知', releaseNotes: '暂无更新日志' });
  });

  test('确认更新后下载并重启', async () => {
    const update = createUpdate();
    const { dependencies, getDialogActions } = createDependencies({
      checkForUpdate: jest.fn().mockResolvedValue(update)
    });
    await new UpdateService(dependencies).check(true);
    await getDialogActions()?.confirm();
    expect(dependencies.showMessage).toHaveBeenCalledWith('正在下载更新...');
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(dependencies.relaunch).toHaveBeenCalledTimes(1);
  });

  test('下载失败时不重启并提示失败', async () => {
    const error = new Error('download failed');
    const update = createUpdate({ downloadAndInstall: jest.fn().mockRejectedValue(error) });
    const { dependencies, getDialogActions } = createDependencies({
      checkForUpdate: jest.fn().mockResolvedValue(update)
    });
    await new UpdateService(dependencies).check(true);
    await getDialogActions()?.confirm();
    expect(dependencies.relaunch).not.toHaveBeenCalled();
    expect(dependencies.log).toHaveBeenCalledWith('下载更新失败', error);
    expect(dependencies.showMessage).toHaveBeenCalledWith('下载更新失败');
  });

  test('取消更新时显示提示', async () => {
    const { dependencies, getDialogActions } = createDependencies({
      checkForUpdate: jest.fn().mockResolvedValue(createUpdate())
    });
    await new UpdateService(dependencies).check(true);
    getDialogActions()?.cancel();
    expect(dependencies.showMessage).toHaveBeenCalledWith('已取消更新');
  });

  test.each([false, true])('检查失败按手动状态决定是否提示: manual=%s', async manual => {
    const error = new Error('check failed');
    const { dependencies } = createDependencies({
      checkForUpdate: jest.fn().mockRejectedValue(error)
    });
    await new UpdateService(dependencies).check(manual);
    expect(dependencies.log).toHaveBeenCalledWith('检查更新失败', error);
    expect(dependencies.showMessage).toHaveBeenCalledTimes(manual ? 1 : 0);
  });
});

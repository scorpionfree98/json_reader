export interface AvailableUpdate {
  version?: string;
  body?: string;
  downloadAndInstall(): Promise<void>;
}

export interface SafeUpdateDetails {
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
}

export interface UpdateDialogActions {
  confirm(): Promise<void>;
  cancel(): void;
}

export interface UpdateServiceDependencies {
  isTauri(): boolean;
  isDisabled(): boolean;
  checkForUpdate(): Promise<AvailableUpdate | null>;
  getCurrentVersion(): Promise<string>;
  relaunch(): Promise<void>;
  showMessage(message: string): void;
  showDialog(details: SafeUpdateDetails, actions: UpdateDialogActions): void;
  log(message: string, error?: unknown): void;
}

export const escapeUpdateHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export class UpdateService {
  constructor(private readonly dependencies: UpdateServiceDependencies) {}

  async check(manual = false): Promise<void> {
    const dependencies = this.dependencies;
    if (!dependencies.isTauri()) {
      dependencies.showMessage('更新检查仅在应用模式中可用');
      return;
    }
    if (dependencies.isDisabled() && !manual) {
      dependencies.log('自动更新已禁用，跳过检查');
      return;
    }

    try {
      const update = await dependencies.checkForUpdate();
      if (!update) {
        if (manual) dependencies.showMessage('当前已是最新版本');
        return;
      }

      const currentVersion = await dependencies.getCurrentVersion();
      dependencies.showDialog({
        currentVersion: escapeUpdateHtml(currentVersion),
        latestVersion: escapeUpdateHtml(update.version || '未知'),
        releaseNotes: escapeUpdateHtml(update.body || '暂无更新日志')
      }, {
        confirm: async () => {
          dependencies.showMessage('正在下载更新...');
          try {
            await update.downloadAndInstall();
            await dependencies.relaunch();
          } catch (error) {
            dependencies.log('下载更新失败', error);
            dependencies.showMessage('下载更新失败');
          }
        },
        cancel: () => dependencies.showMessage('已取消更新')
      });
    } catch (error) {
      dependencies.log('检查更新失败', error);
      if (manual) dependencies.showMessage('检查更新失败');
    }
  }
}

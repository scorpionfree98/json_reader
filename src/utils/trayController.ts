export interface TrayEvent<T> {
  payload: T;
}

export type Unlisten = () => void;
export type TrayListen = <T>(event: string, handler: (event: TrayEvent<T>) => void) => Promise<Unlisten>;

export interface TrayHandlers {
  checkUpdates(): void | Promise<void>;
  showWindow(): void | Promise<void>;
  hideWindow(): void | Promise<void>;
  setAlwaysOnTop(enabled: boolean): void | Promise<void>;
  setAutostart(enabled: boolean): void | Promise<void>;
  setUpdateDisabled(disabled: boolean): void | Promise<void>;
}

export interface TrayControllerOptions {
  isTauri(): boolean;
  listen: TrayListen;
  handlers: TrayHandlers;
  log(message: string, error?: unknown): void;
}

interface TrayRegistration<T = unknown> {
  event: string;
  run(payload: T): void | Promise<void>;
}

export class TrayController {
  private unlisteners: Unlisten[] = [];
  private generation = 0;

  constructor(private readonly options: TrayControllerOptions) {}

  async init(): Promise<void> {
    await this.dispose();
    if (!this.options.isTauri()) return;

    const generation = ++this.generation;
    const registrations: TrayRegistration<any>[] = [
      { event: 'tray://check-updates', run: () => this.options.handlers.checkUpdates() },
      { event: 'tray://show', run: () => this.options.handlers.showWindow() },
      { event: 'tray://hide', run: () => this.options.handlers.hideWindow() },
      { event: 'tray://toggle-always-on-top', run: payload => this.options.handlers.setAlwaysOnTop(Boolean(payload)) },
      { event: 'tray://toggle-autostart', run: payload => this.options.handlers.setAutostart(Boolean(payload)) },
      { event: 'tray://toggle-disable-update', run: payload => this.options.handlers.setUpdateDisabled(Boolean(payload)) }
    ];
    const pendingUnlisteners: Unlisten[] = [];

    try {
      for (const registration of registrations) {
        const unlisten = await this.options.listen(registration.event, event => {
          this.runHandler(registration.event, () => registration.run(event.payload));
        });
        if (generation !== this.generation) {
          unlisten();
          pendingUnlisteners.forEach(dispose => dispose());
          return;
        }
        pendingUnlisteners.push(unlisten);
      }
      this.unlisteners = pendingUnlisteners;
    } catch (error) {
      pendingUnlisteners.forEach(unlisten => unlisten());
      this.options.log('注册托盘监听失败', error);
    }
  }

  async dispose(): Promise<void> {
    this.generation += 1;
    const unlisteners = this.unlisteners.splice(0);
    for (const unlisten of unlisteners) {
      try {
        unlisten();
      } catch (error) {
        this.options.log('清理托盘监听失败', error);
      }
    }
  }

  private runHandler(event: string, handler: () => void | Promise<void>): void {
    try {
      Promise.resolve(handler()).catch(error => this.options.log(`处理托盘事件 ${event} 失败`, error));
    } catch (error) {
      this.options.log(`处理托盘事件 ${event} 失败`, error);
    }
  }
}

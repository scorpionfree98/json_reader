import { AsyncActionQueue } from '../asyncActionQueue';

describe('AsyncActionQueue', () => {
  test('按提交顺序串行执行异步操作', async () => {
    const queue = new AsyncActionQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });

    const first = queue.run(async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
      return 1;
    });
    const second = queue.run(async () => {
      events.push('second:start');
      return 2;
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  test('前一个操作失败后仍继续执行后续操作', async () => {
    const queue = new AsyncActionQueue();
    const first = queue.run(async () => { throw new Error('failed'); });
    const second = queue.run(async () => 'recovered');

    await expect(first).rejects.toThrow('failed');
    await expect(second).resolves.toBe('recovered');
  });
});

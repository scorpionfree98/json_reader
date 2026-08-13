import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { delimiter, dirname } from 'node:path';
import process from 'node:process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const childEnv = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH || ''}`
};
let vite;
let selftest;
let shuttingDown = false;

const isPortOpen = port => new Promise(resolve => {
  const socket = connect({ host: '127.0.0.1', port });
  const finish = open => {
    socket.destroy();
    resolve(open);
  };
  socket.setTimeout(500, () => finish(false));
  socket.once('connect', () => finish(true));
  socket.once('error', () => finish(false));
});

const waitForUrl = async (url, timeout, child) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child.startError) throw new Error(`无法启动 Vite：${child.startError.message}`);
    if (child.exitCode !== null) throw new Error(`Vite 在服务就绪前退出，退出码 ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`等待 Vite 服务超时：${url}`);
};

const runSelftest = () => new Promise((resolve, reject) => {
  selftest = spawn(process.execPath, ['selftest.mjs'], {
    stdio: 'inherit',
    env: childEnv,
    detached: process.platform !== 'win32'
  });
  selftest.once('error', reject);
  selftest.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`浏览器自测${signal ? `被 ${signal} 终止` : `退出码 ${code}`}`));
  });
});

const signalChild = (child, signal) => {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {}
};

const waitForExit = (child, timeout) => {
  if (!child || child.exitCode !== null) return Promise.resolve(true);
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeout);
    const onExit = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
      resolve(true);
    };
    child.once('exit', onExit);
    if (child.exitCode !== null) onExit();
  });
};

const stopChild = async child => {
  signalChild(child, 'SIGTERM');
  if (await waitForExit(child, 3_000)) return;
  signalChild(child, 'SIGKILL');
  await waitForExit(child, 2_000);
};

const stopServices = async () => {
  await stopChild(selftest);
  await stopChild(vite);
};

const shutdown = exitCode => {
  if (shuttingDown) return;
  shuttingDown = true;
  void stopServices().finally(() => process.exit(exitCode));
};

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

try {
  if (await isPortOpen(5173)) {
    throw new Error('Vite 端口 5173 已被其他进程占用，请先关闭后重试');
  }
  vite = spawn(pnpm, ['exec', 'vite', '--host', '127.0.0.1', '--port', '5173'], {
    stdio: 'inherit',
    env: childEnv,
    detached: process.platform !== 'win32'
  });
  vite.startError = undefined;
  vite.once('error', error => { vite.startError = error; });
  await waitForUrl('http://127.0.0.1:5173', 20_000, vite);
  await runSelftest();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await stopServices();
}

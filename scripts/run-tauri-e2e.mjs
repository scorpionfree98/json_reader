import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { delimiter, dirname } from 'node:path';
import process from 'node:process';

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20 || nodeMajor >= 26) {
  console.error(`Tauri E2E 需要 Node 20-25，当前为 ${process.versions.node}。请先执行 nvm use。`);
  process.exit(1);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const tauriWd = process.platform === 'win32' ? 'tauri-wd.exe' : 'tauri-wd';
const services = [];
let shuttingDown = false;
const childEnv = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH || ''}`
};

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const { abortOnPattern, captureOutput = false, ...spawnOptions } = options;
  const child = spawn(command, args, {
    stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: childEnv,
    ...spawnOptions
  });
  let output = '';
  let abortRequested = false;
  const forward = (stream, chunk) => {
    stream.write(chunk);
    output = (output + chunk.toString()).slice(-100_000);
    if (abortOnPattern?.test(output) && !abortRequested) {
      abortRequested = true;
      try {
        if (spawnOptions.detached && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {}
    }
  };
  if (captureOutput) {
    child.stdout.on('data', chunk => forward(process.stdout, chunk));
    child.stderr.on('data', chunk => forward(process.stderr, chunk));
  }
  child.once('error', reject);
  child.once('exit', code => {
    if (code === 0) return resolve();
    const error = new Error(`${command} 退出码 ${code}`);
    error.output = output;
    reject(error);
  });
});

const isWebDriverInfrastructureFailure = (error) =>
  /plugin request failed|no pending script with that id|lock poisoned|failed to lock pending scripts/i
    .test(error?.output || '');

const startService = (command, args) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: childEnv,
    detached: process.platform !== 'win32'
  });
  child.startError = undefined;
  child.once('error', error => { child.startError = error; });
  services.push(child);
  return child;
};

const isPortOpen = (port) => new Promise(resolve => {
  const socket = connect({ host: '127.0.0.1', port });
  const finish = value => {
    socket.destroy();
    resolve(value);
  };
  socket.setTimeout(500, () => finish(false));
  socket.once('connect', () => finish(true));
  socket.once('error', () => finish(false));
});

const assertPortAvailable = async (port, service) => {
  if (await isPortOpen(port)) {
    throw new Error(`${service} 端口 ${port} 已被其他进程占用，请先关闭后重试`);
  }
};

const waitForUrl = async (url, timeout = 20_000, child) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child?.startError) throw new Error(`无法启动 ${child.spawnfile}: ${child.startError.message}`);
    if (child && child.exitCode !== null) {
      throw new Error(`${child.spawnfile} 在服务就绪前退出，退出码 ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`等待服务超时: ${url}`);
};

const signalService = (child, signal) => {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {}
};

const waitForExit = async (child, timeout) => {
  if (!child || child.exitCode !== null) return true;
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeout);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
    if (child.exitCode !== null) onExit();
  });
};

const stopService = async child => {
  if (!child?.pid || child.exitCode !== null) return;
  signalService(child, 'SIGTERM');
  if (await waitForExit(child, 3_000)) return;
  signalService(child, 'SIGKILL');
  await waitForExit(child, 2_000);
};

const stopServices = async () => {
  const pending = services.splice(0).reverse();
  await Promise.all(pending.map(stopService));
};

const shutdown = exitCode => {
  if (shuttingDown) return;
  shuttingDown = true;
  void stopServices().finally(() => process.exit(exitCode));
};

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

try {
  await run('cargo', ['build', '--manifest-path', 'src-tauri/Cargo.toml', '--features', 'webdriver']);
  await assertPortAvailable(5173, 'Vite');
  await assertPortAvailable(4444, 'Tauri WebDriver');
  const vite = startService(pnpm, ['exec', 'vite', '--host', '127.0.0.1', '--port', '5173']);
  await waitForUrl('http://127.0.0.1:5173', 20_000, vite);
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const webdriver = startService(tauriWd, ['--port', '4444', '--log-level', 'warn']);
    try {
      await waitForUrl('http://127.0.0.1:4444/status', 20_000, webdriver);
      await run(pnpm, ['exec', 'wdio', 'run', 'wdio.conf.mjs'], {
        abortOnPattern: /plugin request failed|no pending script with that id|lock poisoned|failed to lock pending scripts/i,
        captureOutput: true,
        detached: process.platform !== 'win32'
      });
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      await stopService(webdriver);
      if (!isWebDriverInfrastructureFailure(error) || attempt === 2) throw error;
      console.warn('Tauri WebDriver 插件异常，使用全新进程重试一次。');
    }
  }
  if (lastError) throw lastError;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await stopServices();
}

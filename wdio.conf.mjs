import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const binaryName = process.platform === 'win32'
    ? 'json_formatter_tauri.exe'
    : 'json_formatter_tauri';

export const config = {
    // WebDriver server port
    hostname: '127.0.0.1',
    port: 4444,

    // Test runner configuration
    runner: 'local',

    // Specs to run
    specs: [
        './tests/tauri.e2e.spec.js'
    ],

    // Maximum instances to run
    maxInstances: 1,

    // Capabilities
    capabilities: [{
        'tauri:options': {
            // Path to your Tauri debug binary
            // macOS: './src-tauri/target/debug/json_formatter_tauri'
            // Windows: './src-tauri/target/debug/json_formatter_tauri.exe'
            // Linux: './src-tauri/target/debug/json_formatter_tauri'
            binary: resolve(projectRoot, 'src-tauri', 'target', 'debug', binaryName),
        }
    }],

    // Test framework
    framework: 'mocha',

    // Mocha options
    mochaOpts: {
        ui: 'bdd',
        timeout: 60000,
        grep: process.env.WDIO_GREP || undefined
    },

    // Logging
    logLevel: 'warn',

    // Base URL for your dev server
    // Make sure your Vite dev server is running on this port
    baseUrl: 'http://127.0.0.1:5173',

    // Wait for timeout
    waitforTimeout: 10000,

    // Connection retry attempts
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,

    // Services
    services: [],

    // Reporters
    reporters: ['spec'],

    // Hooks
    before: async function () {
        await browser.execute(() => {
            localStorage.removeItem('json_formatter_view_mode');
            localStorage.removeItem('json_formatter_theme');
        });
        await browser.refresh();
        await browser.waitUntil(
            () => browser.execute(() => Boolean(document.querySelector('#sourceText'))),
            { timeout: 10000, timeoutMsg: '应用主输入框未加载' }
        );
    },

    after: function (result, capabilities, specs) {
        // Cleanup code after tests
    }
};

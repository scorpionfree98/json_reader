export const config = {
    // WebDriver server port
    port: 4444,

    // Test runner configuration
    runner: 'local',

    // Specs to run
    specs: [
        './tests/specs/*.spec.js'
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
            binary: process.platform === 'win32'
                ? './src-tauri/target/debug/json_formatter_tauri.exe'
                : './src-tauri/target/debug/json_formatter_tauri',
        }
    }],

    // Test framework
    framework: 'mocha',

    // Mocha options
    mochaOpts: {
        ui: 'bdd',
        timeout: 60000
    },

    // Logging
    logLevel: 'info',

    // Base URL for your dev server
    // Make sure your Vite dev server is running on this port
    baseUrl: 'http://localhost:5173',

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
    before: function (capabilities, specs) {
        // Setup code before tests
    },

    after: function (result, capabilities, specs) {
        // Cleanup code after tests
    }
};

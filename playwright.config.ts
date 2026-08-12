import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    viewport: { width: 800, height: 600 },
    actionTimeout: 5000,
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5173',
    port: 5173,
    timeout: 30000,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});

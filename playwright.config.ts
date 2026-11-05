import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Each LSEG spec drives several logged-in users inside one worker, so keep specs serial.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'lseg',
      testDir: './Test/LSEG',
      use: { ...devices['Desktop Chrome'], headless: process.env.HEADED !== 'true' },
    },
  ],
});

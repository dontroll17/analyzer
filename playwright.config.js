const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '.');
const FIXTURES_DIR = path.join(__dirname, 'tests', 'e2e', 'fixtures');
const GLITCH_WAV = path.join(FIXTURES_DIR, 'glitch.wav');
const SILENCE_WAV = path.join(FIXTURES_DIR, 'silence.wav');
const SINE_WAV = path.join(FIXTURES_DIR, '1kHz_sine.wav');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Media emulation flags for automated capture testing (Phase 3.5)
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        // Preload test audio fixture for fake audio capture
        `--use-file-for-fake-audio-capture=${SILENCE_WAV}`,
        // Enable memory profiling for Phase 5
        '--enable-precise-memory-info',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Extended timeout project for long-running stability tests
    {
      name: 'chromium-longrunning',
      use: {
        ...devices['Desktop Chrome'],
        timeout: 120000, // 2 minutes per test
      },
    },
  ],
  webServer: {
    command: 'npx http-server -p 8080 -c-1',
    port: 8080,
    reuseExistingServer: true,
  },
});

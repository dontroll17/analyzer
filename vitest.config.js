import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'tests/unit/**/*.spec.js',
      'dsp-engine/tests/**/*.test.js',
      'dsp-engine/tests/**/*.spec.js',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Only check coverage for files that are actually imported in tests
      include: [
        'dsp-engine/**/*.js',
        'popup/**/popup-testable.js',
      ],
      exclude: [
        'node_modules/',
        'tests/',
        'scripts/',
        'coverage/',
        '**/*.test.js',
        '**/*.spec.js',
        // Main extension files tested via E2E, not unit tests
        'background.js',
        'content.js',
        'offscreen.js',
        'logger.js',
        // Not yet tested
        'dsp-engine/audio-worklet.js',
        'dsp-engine/frequency-bands.js',
        'dsp-engine/real-speech.js',
        'dsp-engine/channel-processor.js',
        'popup/popup.js',
        'popup/config.js',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});

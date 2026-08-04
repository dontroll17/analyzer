import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    allowAutoTruncate: true,
    include: [
      'tests/unit/**/*.spec.js',
      'dsp-engine/tests/**/*.test.js',
      'dsp-engine/tests/**/*.spec.js',
    ],
    setupFiles: ['tests/unit/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Only measure coverage for files that have unit tests
      include: [
        'dsp-engine/rms.js',
        'dsp-engine/midi-export.js',
        'dsp-engine/defensive-processors.js',
        'popup/popup-testable.js',
        'dsp-engine/limiter.js',
        'dsp-engine/session-db.js', // ← V1.4: session DB config
        'logger.js', // ← V1.1: logger.js coverage (12 tests exist)
      ],
      // Exclude files not covered by unit tests
      exclude: [
        'node_modules/',
        'tests/',
        'scripts/',
        'coverage/',
        '**/*.test.js',
        '**/*.spec.js',
        // Main extension files tested via E2E only (not counted in coverage threshold)
        'background.js',
        'content.js',
        'offscreen.js',
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
  optimizeDeps: {
    include: ['popup/config.js'],
  },
});

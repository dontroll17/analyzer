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
    setupFiles: ['tests/unit/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Include main extension files for coverage measurement
      include: [
        'background.js',
        'content.js',
        'offscreen.js',
        'logger.js',
        'dsp-engine/**/*.js',
        'popup/**/*.js',
      ],
      exclude: [
        'node_modules/',
        'tests/',
        'scripts/',
        'coverage/',
        '**/*.test.js',
        '**/*.spec.js',
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

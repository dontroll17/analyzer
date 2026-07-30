export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [],
  moduleFileExtensions: ['js'],
  testMatch: [
    '<rootDir>/dsp-engine/tests/**/*.test.js',
    '<rootDir>/tests/**/*.test.js',
  ],
  verbose: true,
  // Use jsdom for browser API tests (window, CustomEvent, etc.)
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};

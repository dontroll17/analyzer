export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [],
  moduleFileExtensions: ['js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  verbose: true,
  // Use jsdom for browser API tests (window, CustomEvent, etc.)
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};

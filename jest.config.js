export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [],
  moduleFileExtensions: ['js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  verbose: true,
};

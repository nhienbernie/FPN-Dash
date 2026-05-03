module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
    '/.claude/',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/.claude/',
  ],
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/e2e/**',
    '!**/.claude/**',
  ],
};

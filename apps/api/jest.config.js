/** @type {import('jest').Config} */
module.exports = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  roots:           ['<rootDir>/src'],
  testMatch:       ['**/__tests__/**/*.test.ts'],
  passWithNoTests: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
}

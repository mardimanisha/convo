/** @type {import('jest').Config} */
module.exports = {
  preset:          'ts-jest',
  testEnvironment: 'jsdom',
  roots:           ['<rootDir>/src'],
  testMatch:       ['**/__tests__/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  moduleNameMapper: { '\\.(css|svg)$': '<rootDir>/src/__mocks__/styleMock.js' },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
}

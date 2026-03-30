import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { ...tsPlugin.configs.recommended.rules },
  },
  // ADR-04: ui/ → logic/ → data/ layer dependency rule
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['*/data/*', '../data/*', '../../data/*'],
          message: 'ui/ must not import from data/ — use logic/ instead (ADR-04)',
        }],
      }],
    },
  },
  {
    files: ['src/logic/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['*/ui/*', '../ui/*', '../../ui/*'],
          message: 'logic/ must not import from ui/ (ADR-04)',
        }],
      }],
    },
  },
  {
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['*/ui/*',    '../ui/*'],    message: 'data/ must not import from ui/ (ADR-04)' },
          { group: ['*/logic/*', '../logic/*'], message: 'data/ must not import from logic/ (ADR-04)' },
          { group: ['react', 'react-dom'],      message: 'data/ must not import React (ADR-04)' },
          { group: ['xstate'],                  message: 'data/ must not import XState — use logic/ (ADR-04)' },
        ],
      }],
    },
  },
]

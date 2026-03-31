// @ts-check
const tsParser = require('@typescript-eslint/parser')
const tsPlugin = require('@typescript-eslint/eslint-plugin')

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: './tsconfig.json' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {},
  },

  // data/ layer: no React, no XState, no internal cross-layer imports
  {
    files: ['src/data/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react-dom', 'react/*'], message: 'data/ layer must not import React' },
          { group: ['xstate', 'xstate/*'],            message: 'data/ layer must not import XState' },
          { group: ['../logic/*', '../ui/*', '../../logic/*', '../../ui/*'],
            message: 'data/ layer must not import from logic/ or ui/' },
        ],
      }],
    },
  },

  // logic/ layer: may only import from data/, not from ui/
  {
    files: ['src/logic/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['../ui/*', '../../ui/*', './ui/*'],
            message: 'logic/ layer must not import from ui/' },
        ],
      }],
    },
  },

  // ui/ layer: may only import from logic/, not from data/ directly
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['../data/*', '../../data/*', './data/*'],
            message: 'ui/ layer must not import from data/ directly — go through logic/' },
        ],
      }],
    },
  },
]

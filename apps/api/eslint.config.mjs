import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import globals from 'globals'

export default [
  { ignores: ['src/@types/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    ignores: ['src/__tests__/**', 'src/@types/**'],
    languageOptions: {
      parser: tsParser,
      globals: { ...globals.node },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-console': 'error',
      'no-undef': 'off', // TypeScript's type-checker handles undefined references
    },
  },
  {
    files: ['src/__tests__/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      globals: { ...globals.node, ...globals.jest },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-console': 'error',
      'no-undef': 'off',
    },
  },
]

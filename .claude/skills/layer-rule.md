# Skill: Frontend Layer Dependency Rule (ADR-04)

## Rule

```
ui/  →  logic/  →  data/
```

| Layer | May import from | Must NOT import from |
|-------|----------------|----------------------|
| `ui/` | `logic/` only | `data/`, React native APIs directly |
| `logic/` | `data/` only | `ui/` |
| `data/` | Nothing internal | `logic/`, `ui/`, React, XState |

## ESLint configuration (`packages/speech-widget/eslint.config.mjs`)

```javascript
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
  // ADR-04: ui/ → logic/ → data/
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
          { group: ['xstate'],                  message: 'data/ must not import XState — belongs in logic/ (ADR-04 + bundle budget)' },
        ],
      }],
    },
  },
]
```

## Checking for violations

```bash
npm run lint --workspaces --if-present 2>&1 | grep "no-restricted-imports"
```
Zero output = ✅. Any output = ❌ fix before committing.

## Common mistakes to avoid

| ❌ Wrong | ✅ Right |
|---------|---------|
| `ui/SpeechButton` imports `WsTransport` from `data/` | Get transport via context from `logic/` |
| `data/AudioCapture` imports `useState` from React | Use EventEmitter/callbacks — no React in data/ |
| `data/TranscriptClient` imports `createMachine` from xstate | XState belongs in `logic/recordingMachine.ts` |
| `logic/useRecorder` imports `SpeechButton` from `ui/` | Logic never imports UI |
| `data/WsTransport` uses `xstate` for state | Use plain class state — no XState in data/ |

## Why this matters

- **Testability**: `data/` can be tested in Node.js without jsdom. `logic/` can be tested without a real DOM.
- **Bundle size**: XState (~30KB) stays in `logic/` only — not duplicated into `data/`.
- **Parallel development**: phases 3 (data+logic) and 4 (ui) can be built independently.

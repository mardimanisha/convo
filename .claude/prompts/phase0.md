# Phase 0 — Repo & Monorepo Setup

> Read this file once at the start of your session in the primary `voice-adapter` repo.
> After reading, run `/setup` then `/plan`.

## Context

You are scaffolding the entire monorepo from scratch. Nothing exists yet except the `.git` folder
and this `.claude/` directory. Phase 0 produces a compilable, lint-clean, CI-passing skeleton
that every subsequent phase builds on top of. Do not write any business logic here.

**Working directory:** `~/voice-adapter` (primary repo, `main` branch)
**Branch:** `main` (Phase 0 commits directly to main — no worktree needed)
**Tooling:** npm workspaces (NOT pnpm, NOT Turborepo — do not add turbo.json)
**Stack:** TypeScript 5.4, ESLint, Prettier, Jest, GitHub Actions
**Done when:** `npm run tsc --workspaces --if-present` passes with zero errors.

---

## Step 0 — Before writing a single file

### 0a. Ask for the npm org scope

Do not use `@acme`. Ask the user:

> "What is your npm org scope? (e.g. `@myorg`) — this replaces `@acme` in all package names."

Wait for the answer. Store it as `{orgname}`. Every file you create must use `@{orgname}`, never `@acme`.

### 0b. Note open questions — do not block on them

| ID | Question | How to handle in Phase 0 |
|----|----------|--------------------------|
| OQ-01 | Auth token mechanism | Irrelevant — no auth code yet |
| OQ-02 | Interim transcript destination | Irrelevant |
| OQ-03 | Deepgram concurrent stream limit | Irrelevant |
| OQ-04 | Push-to-talk in v1 or v1.1? | Irrelevant |

---

## Task P0-1 — Initialise npm workspaces monorepo

> ⚠️ This project uses **npm workspaces**. Do NOT create a `turbo.json`. Do NOT install pnpm.

### Root `package.json`
```json
{
  "name": "voice-adapter",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build":   "npm run build  --workspaces --if-present",
    "test":    "npm run test   --workspaces --if-present",
    "lint":    "npm run lint   --workspaces --if-present",
    "tsc":     "npm run tsc    --workspaces --if-present",
    "dev:api": "npm run dev    --workspace=apps/api"
  }
}
```

### `.npmrc`
```
legacy-peer-deps=true
```

### `.prettierrc`
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### `.gitignore`
```
node_modules/
dist/
*.tsbuildinfo
.env
coverage/
```

### `docker-compose.yml`
```yaml
version: '3.9'
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --save "" --appendonly no

  api:
    build: { context: ./apps/api }
    ports: ["3000:3000"]
    environment:
      - DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY}
      - REDIS_URL=redis://redis:6379
      - LOG_LEVEL=debug
      - PORT=3000
      - INSTANCE_ID=dev-1
    depends_on: [redis]
    volumes: ["./apps/api/src:/app/src"]
```

### `.env.example`
```bash
DEEPGRAM_API_KEY=your_deepgram_key_here
REDIS_URL=redis://localhost:6379
PORT=3000
LOG_LEVEL=info
INSTANCE_ID=node-1
MAX_CONCURRENT_SESSIONS_PER_CLIENT=10
MAX_SESSION_OPENS_PER_MINUTE=50
SESSION_TTL_SECONDS=1800
VITE_API_URL=wss://api.yourdomain.com/ws
```

### Scaffold directories (empty for now)
```
apps/
  api/
    src/
      routes/       ← empty, Phase 1+2
      controllers/  ← empty, Phase 1+2
      services/     ← empty, Phase 1+2
      infra/        ← empty, Phase 1
    package.json
    tsconfig.json
    Dockerfile

packages/
  speech-widget/
    src/
      ui/           ← empty, Phase 4
      logic/        ← empty, Phase 3
      data/         ← types.ts only in Phase 0
    package.json
    tsconfig.json
    vite.config.ts
```

### `apps/api/package.json`
```json
{
  "name": "@{orgname}/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev":   "ts-node-dev --respawn src/index.ts",
    "lint":  "eslint src --ext .ts",
    "test":  "jest",
    "tsc":   "tsc --noEmit"
  },
  "dependencies": {
    "express":       "^4.19.0",
    "ws":            "^8.17.0",
    "ioredis":       "^5.3.0",
    "pino":          "^9.0.0",
    "pino-http":     "^10.0.0",
    "prom-client":   "^15.0.0",
    "@deepgram/sdk": "^3.3.0",
    "uuid":          "^10.0.0",
    "zod":           "^3.23.0"
  },
  "devDependencies": {
    "typescript":       "^5.4.0",
    "jest":             "^29.0.0",
    "@types/jest":      "^29.0.0",
    "ts-jest":          "^29.0.0",
    "supertest":        "^7.0.0",
    "@types/supertest": "^6.0.0",
    "ioredis-mock":     "^8.9.0",
    "@types/express":   "^4.17.0",
    "@types/ws":        "^8.5.0",
    "@types/uuid":      "^10.0.0",
    "@types/node":      "^20.0.0",
    "ts-node-dev":      "^2.0.0"
  }
}
```

### `packages/speech-widget/package.json`
```json
{
  "name": "@{orgname}/speech-widget",
  "version": "0.1.0",
  "private": false,
  "main":   "./dist/speech-widget.cjs.js",
  "module": "./dist/speech-widget.es.js",
  "types":  "./dist/index.d.ts",
  "exports": {
    ".": {
      "import":  "./dist/speech-widget.es.js",
      "require": "./dist/speech-widget.cjs.js",
      "types":   "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "vite build",
    "lint":  "eslint src --ext .ts,.tsx",
    "test":  "jest",
    "tsc":   "tsc --noEmit"
  },
  "peerDependencies": {
    "react": ">=18"
  },
  "dependencies": {
    "xstate": "^5.0.0"
  },
  "devDependencies": {
    "react":                     "^18.0.0",
    "react-dom":                 "^18.0.0",
    "@types/react":              "^18.0.0",
    "@types/react-dom":          "^18.0.0",
    "typescript":                "^5.4.0",
    "vite":                      "^5.0.0",
    "@vitejs/plugin-react":      "^4.0.0",
    "jest":                      "^29.0.0",
    "@types/jest":               "^29.0.0",
    "ts-jest":                   "^29.0.0",
    "jest-environment-jsdom":    "^29.0.0",
    "@testing-library/react":    "^15.0.0",
    "@testing-library/jest-dom": "^6.0.0"
  }
}
```

### `apps/api/Dockerfile`
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Done criteria for P0-1
- [ ] All directories scaffolded
- [ ] No `turbo.json` exists anywhere
- [ ] No `pnpm` or `pnpm-workspace.yaml` anywhere
- [ ] `@acme` appears nowhere — only `@{orgname}`
- [ ] `docker compose up redis -d` starts Redis without errors
- [ ] `npm install` completes without errors at repo root

---

## Task P0-2 — Toolchain & CI skeleton

### Root `tsconfig.json` (base — extended by all packages)
```json
{
  "compilerOptions": {
    "target":           "ES2022",
    "lib":              ["ES2022"],
    "strict":           true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck":     true,
    "declaration":      true,
    "declarationMap":   true,
    "sourceMap":        true
  }
}
```

### `apps/api/tsconfig.json`
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir":           "./dist",
    "rootDir":          "./src",
    "module":           "CommonJS",
    "moduleResolution": "Node",
    "lib":              ["ES2022"],
    "types":            ["node", "jest"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### `packages/speech-widget/tsconfig.json`
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir":           "./dist",
    "rootDir":          "./src",
    "module":           "ESNext",
    "moduleResolution": "Bundler",
    "jsx":              "react-jsx",
    "lib":              ["ES2022", "DOM", "DOM.Iterable"],
    "types":            ["jest", "@testing-library/jest-dom"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### `packages/speech-widget/vite.config.ts`
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry:    'src/index.ts',
      formats:  ['es', 'cjs'],
      fileName: (format) => `speech-widget.${format}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'xstate'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', xstate: 'XState' },
      },
    },
    minify:    'esbuild',
    sourcemap: false,
  },
})
```

### `packages/speech-widget/eslint.config.mjs`
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
```

### `apps/api/eslint.config.mjs`
```javascript
import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tsParser },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-console': 'error',
    },
  },
]
```

### `apps/api/jest.config.js`
```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  roots:           ['<rootDir>/src'],
  testMatch:       ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
}
```

### `packages/speech-widget/jest.config.js`
```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset:          'ts-jest',
  testEnvironment: 'jsdom',
  roots:           ['<rootDir>/src'],
  testMatch:       ['**/__tests__/**/*.test.{ts,tsx}'],
  setupFilesAfterFramework: ['@testing-library/jest-dom'],
  moduleNameMapper: { '\\.(css|svg)$': '<rootDir>/src/__mocks__/styleMock.js' },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
}
```

Create `packages/speech-widget/src/__mocks__/styleMock.js`:
```javascript
module.exports = {}
```

### `.github/workflows/ci.yml`
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: TypeScript check
        run: npm run tsc --workspaces --if-present

      - name: Lint
        run: npm run lint --workspaces --if-present

      - name: Test
        run: npm run test --workspaces --if-present
        env:
          REDIS_URL: redis://localhost:6379

      - name: Build
        run: npm run build --workspaces --if-present

      - name: Bundle size gate
        run: |
          BYTES=$(find packages/speech-widget/dist -name "*.js" | xargs gzip -c | wc -c)
          echo "Bundle size: ${BYTES} bytes (limit: 51200)"
          if [ "$BYTES" -gt 51200 ]; then
            echo "❌ Bundle exceeds 50KB gzip limit"
            exit 1
          fi
          echo "✅ Bundle within limit"

      - name: API key check
        run: |
          if grep -r "DEEPGRAM_API_KEY" packages/speech-widget/dist 2>/dev/null; then
            echo "❌ DEEPGRAM_API_KEY found in widget bundle!"
            exit 1
          fi
          echo "✅ No API key in bundle"
```

### Done criteria for P0-2
- [ ] `npm run lint --workspaces --if-present` — zero errors
- [ ] `npm run tsc --workspaces --if-present` — zero errors
- [ ] `npm run test --workspaces --if-present` — runs (zero tests is fine at this stage)
- [ ] GitHub Actions workflow is valid YAML with no pnpm or turbo steps
- [ ] ESLint `no-restricted-imports` rules wired for all three frontend layers
- [ ] Vite externalises `react`, `react-dom`, `xstate`

---

## Task P0-3 — Shared types (lock before any implementation)

### `packages/speech-widget/src/data/types.ts`
```typescript
import type { EventEmitter } from 'events'

// ── Widget configuration ──────────────────────────────────────────────────────

export interface SpeechConfig {
  apiUrl:         string
  targetSelector: string
  lang?:          string                      // BCP-47, default 'en-US'
  theme?:         'light' | 'dark' | 'auto'  // default 'auto'
  onTranscript?:  (text: string) => void
  onError?:       (error: SpeechError) => void
}

// ── Recording state machine ───────────────────────────────────────────────────

/** Five valid states of the recording lifecycle (ADR-03 — no boolean flags). */
export type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing' | 'error'

// ── Transcript ────────────────────────────────────────────────────────────────

export interface TranscriptEvent {
  type:        'interim' | 'final'
  text:        string
  confidence?: number
  sessionId:   string
}

// ── Wire protocol ─────────────────────────────────────────────────────────────

export type ClientControlMessage =
  | { type: 'session.open';  sessionId: string; lang: string }
  | { type: 'session.close'; sessionId: string }

export type ServerMessage =
  | { type: 'transcript.interim'; text: string; confidence: number }
  | { type: 'transcript.final';   text: string; confidence: number }
  | { type: 'error'; code: SpeechErrorCode; message: string }

// ── Errors ────────────────────────────────────────────────────────────────────

export type SpeechErrorCode =
  | 'PERMISSION_DENIED'
  | 'NO_SPEECH'
  | 'NETWORK_ERROR'
  | 'TARGET_NOT_FOUND'
  | 'DEEPGRAM_UNAVAILABLE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_MESSAGE'

export class SpeechError extends Error {
  constructor(public readonly code: SpeechErrorCode, message: string) {
    super(message)
    this.name = 'SpeechError'
  }
}

// ── TranscriptClient interface ────────────────────────────────────────────────

export interface ITranscriptClient extends EventEmitter {
  connect(sessionId: string, lang: string): Promise<void>
  disconnect(): void
  sendChunk(data: Blob | ArrayBuffer): void
  on(event: 'transcript', fn: (e: TranscriptEvent) => void): this
  on(event: 'error',      fn: (e: SpeechError) => void): this
}
```

### `apps/api/src/infra/types.ts`
```typescript
import type { EventEmitter } from 'events'

// Re-export from frontend types for shared use
export type { TranscriptEvent, SpeechErrorCode } from '../../../packages/speech-widget/src/data/types'

// ── Session ───────────────────────────────────────────────────────────────────

export interface SessionRecord {
  sessionId:    string
  clientId:     string
  lang:         string
  createdAt:    string   // ISO 8601
  lastActiveAt: string   // ISO 8601
  instanceId:   string
}

// ── Deepgram ──────────────────────────────────────────────────────────────────

export interface DeepgramOptions { language: string }

export interface IDeepgramSession {
  send(chunk: Buffer): void
  close(): void
  on(event: 'transcript', fn: (e: TranscriptEvent) => void): this
  on(event: 'close',      fn: () => void): this
}

export interface IDeepgramAdapter {
  connect(opts: DeepgramOptions): Promise<IDeepgramSession>
}

// ── Redis ─────────────────────────────────────────────────────────────────────
// Note: IRedisAdapter does NOT expose incr/decr — use publish/subscribe/get/set/del/expire only.

export interface IRedisAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  expire(key: string, seconds: number): Promise<void>
  publish(channel: string, message: string): Promise<void>
  subscribe(channel: string, fn: (msg: string) => void): Promise<void>
  unsubscribe(channel: string): Promise<void>
}

// ── Services ──────────────────────────────────────────────────────────────────

export interface ISessionService {
  create(clientId: string, lang: string): Promise<string>
  get(sessionId: string): Promise<SessionRecord | null>
  touch(sessionId: string): Promise<void>
  delete(sessionId: string): Promise<void>
}

export interface IRateLimitService {
  checkAndIncrement(clientId: string): Promise<void>
  decrement(clientId: string): Promise<void>
}

export interface IRelayService extends EventEmitter {
  openSession(sessionId: string, lang: string): Promise<void>
  pipeChunk(sessionId: string, chunk: Buffer): void
  closeSession(sessionId: string): Promise<void>
}
```

### `packages/speech-widget/src/index.ts` (barrel — Phase 4 fills this out)
```typescript
// Populated fully in Phase 4. Phase 0: export types only.
export type {
  SpeechConfig,
  RecordingState,
  TranscriptEvent,
  SpeechErrorCode,
  ITranscriptClient,
  ClientControlMessage,
  ServerMessage,
} from './data/types'
export { SpeechError } from './data/types'
```

### `packages/speech-widget/src/__tests__/types.test.ts`
```typescript
import { SpeechError } from '../data/types'
import type { RecordingState, TranscriptEvent } from '../data/types'

describe('types smoke test', () => {
  it('SpeechError is constructable and extends Error', () => {
    const err = new SpeechError('PERMISSION_DENIED', 'mic denied')
    expect(err.code).toBe('PERMISSION_DENIED')
    expect(err.name).toBe('SpeechError')
    expect(err).toBeInstanceOf(Error)
  })

  it('RecordingState covers all five states', () => {
    const states: RecordingState[] = ['idle', 'requesting', 'recording', 'processing', 'error']
    expect(states).toHaveLength(5)
  })

  it('TranscriptEvent type is structurally correct', () => {
    const event: TranscriptEvent = { type: 'final', text: 'hello', sessionId: 'abc' }
    expect(event.type).toBe('final')
  })
})
```

### Done criteria for P0-3
- [ ] `npm run tsc --workspaces --if-present` — zero errors
- [ ] `npm run test --workspaces --if-present` — 3 tests pass
- [ ] `IRedisAdapter` does NOT include `incr`/`decr` methods
- [ ] `SpeechError` extends `Error` and carries `code`
- [ ] All five `RecordingState` values defined
- [ ] No `@acme` in any file

---

## Phase 0 — Full done criteria

```bash
# 1. No @acme placeholders
grep -r "@acme" . --include="*.json" --include="*.ts" --include="*.tsx" --include="*.md" \
  && echo "❌ @acme found" || echo "✅ No @acme"

# 2. No turbo.json
[ -f turbo.json ] && echo "❌ turbo.json exists — remove it" || echo "✅ No turbo.json"

# 3. TypeScript
npm run tsc --workspaces --if-present 2>&1 | grep -E "error TS" && echo "❌ TS errors" || echo "✅ TS clean"

# 4. Lint
npm run lint --workspaces --if-present 2>&1 | grep -v "^$" | tail -5

# 5. Tests
npm run test --workspaces --if-present 2>&1 | tail -5

# 6. Redis
docker compose up redis -d
docker compose exec redis redis-cli ping   # expected: PONG
```

## Commit when done

```bash
git add -A
git commit -m "chore(p0): scaffold npm workspaces monorepo, toolchain, shared types

Initialises npm workspaces with apps/api and packages/speech-widget.
Configures TypeScript 5.4, ESLint (ADR-04 layer rule), Prettier, Jest,
Vite library mode, and GitHub Actions CI with bundle size gate.
Locks shared types in data/types.ts and apps/api/src/infra/types.ts.

Refs: P0-1, P0-2, P0-3"
```

## What happens next

After Phase 0 is committed to `main`, create two parallel worktrees to start Phase 1 and Phase 3 simultaneously:

```bash
git worktree add ../voice-adapter-backend-infra  -b phase/1-backend-infra  main
git worktree add ../voice-adapter-frontend-data  -b phase/3-frontend-data  main

cd ../voice-adapter-backend-infra && npm install
cd ../voice-adapter-frontend-data && npm install
```

Open Claude Code in each worktree:
- Terminal A: `"Read .claude/prompts/phase1.md then begin."`
- Terminal B: `"Read .claude/prompts/phase3.md then begin."`

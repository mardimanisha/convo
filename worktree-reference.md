# voice-adapter — Git Worktree Reference

## What was created

### Primary repo (Phase 0 committed to `main`)

```
~/                                             ← your home directory
│
├── voice-adapter/                             ← PRIMARY REPO (.git folder lives here)
│   ├── .git/                                  ← real Git database — shared by ALL worktrees
│   │
│   ├── .claude/
│   │   ├── commands/                          ← reusable slash commands (run repeatedly)
│   │   │   ├── plan.md                        ← /plan   — review branch, produce action list
│   │   │   ├── test.md                        ← /test   — run jest + tsc + eslint, fix failures
│   │   │   ├── setup.md                       ← /setup  — install deps, check Redis, sync env
│   │   │   ├── audit.md                       ← /audit  — pre-merge checklist against CLAUDE.md
│   │   │   ├── sync.md                        ← /sync   — rebase current branch onto main
│   │   │   └── commit.md                      ← /commit — stage + write conventional commit msg
│   │   │
│   │   └── prompts/                           ← one-time phase kickoff instructions
│   │       ├── phase1.md                      ← read once when starting Phase 1 session
│   │       ├── phase2.md                      ← read once when starting Phase 2 session
│   │       ├── phase3.md                      ← read once when starting Phase 3 session
│   │       ├── phase4.md                      ← read once when starting Phase 4 session
│   │       └── phase5.md                      ← read once when starting Phase 5 session
│   │
│   ├── apps/
│   │   └── api/                               ← Node.js + Express backend
│   │       ├── src/
│   │       │   ├── routes/                    ← P2-4: wsGateway.ts, speechRoutes.ts,
│   │       │   │                                        healthRoute.ts, metricsRoute.ts
│   │       │   ├── controllers/               ← P2-3: SpeechController.ts
│   │       │   │                                 P1-4: SessionController.ts
│   │       │   ├── services/                  ← P1-2: SessionService.ts
│   │       │   │                                 P1-3: RateLimitService.ts
│   │       │   │                                 P2-2: RelayService.ts
│   │       │   └── infra/                     ← P1-1: logger.ts, metrics.ts
│   │       │                                     P1-2: RedisAdapter.ts
│   │       │                                     P2-1: DeepgramAdapter.ts
│   │       │                                     P0-3: types.ts (backend interfaces)
│   │       │                                     All phases: container.ts
│   │       ├── __tests__/
│   │       ├── package.json
│   │       ├── tsconfig.json
│   │       └── Dockerfile
│   │
│   ├── packages/
│   │   └── speech-widget/                     ← React COMPONENT LIBRARY (not an app)
│   │       ├── src/
│   │       │   ├── ui/                        ← Phase 4 only — presentational components
│   │       │   │   ├── SpeechWidget.tsx       ← P4-5: root component, exported
│   │       │   │   ├── SpeechButton.tsx       ← P4-1
│   │       │   │   ├── WaveAnimation.tsx      ← P4-2
│   │       │   │   ├── TranscriptPreview.tsx  ← P4-3
│   │       │   │   └── StatusBadge.tsx        ← P4-4
│   │       │   ├── logic/                     ← Phase 3 (logic tasks) — hooks + XState
│   │       │   │   ├── recordingMachine.ts    ← P3-4: XState v5 state machine
│   │       │   │   ├── injectTranscript.ts    ← P3-5: native prototype setter trick
│   │       │   │   ├── useRecorder.ts         ← P3-6
│   │       │   │   ├── useTranscript.ts       ← P3-6
│   │       │   │   ├── SpeechProvider.tsx     ← P3-7
│   │       │   │   └── useWidgetConfig.ts     ← P3-7
│   │       │   └── data/                      ← Phase 3 (data tasks) — pure TS, no React
│   │       │       ├── types.ts               ← P0-3: shared types (frontend + backend)
│   │       │       ├── AudioCapture.ts        ← P3-1
│   │       │       ├── WsTransport.ts         ← P3-2
│   │       │       └── TranscriptClient.ts    ← P3-3
│   │       ├── __tests__/
│   │       ├── index.ts                       ← public API — exports SpeechWidget
│   │       ├── package.json
│   │       ├── tsconfig.json
│   │       └── vite.config.ts                 ← library mode build (NOT app mode)
│   │
│   ├── CLAUDE.md                              ← authoritative build guide
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── .gitignore
│   └── package.json                           ← npm workspaces root (no turbo.json)
│
├── voice-adapter-backend-infra/               ← WORKTREE: phase/1-backend-infra
│   └── .git  (text file → voice-adapter/.git)
│
├── voice-adapter-relay-ws/                    ← WORKTREE: phase/2-relay-ws
│   └── .git  (text file → voice-adapter/.git)
│
├── voice-adapter-frontend-data/               ← WORKTREE: phase/3-frontend-data
│   └── .git  (text file → voice-adapter/.git)
│
├── voice-adapter-frontend-ui/                 ← WORKTREE: phase/4-frontend-ui
│   └── .git  (text file → voice-adapter/.git)
│
└── voice-adapter-integration/                 ← WORKTREE: phase/5-integration
    └── .git  (text file → voice-adapter/.git)
```

> **No `turbo.json`.** This project uses **npm workspaces only** — not Turborepo.
> CI runs `npm run lint --workspaces --if-present`, `npm run build --workspaces --if-present`,
> `npm test --workspaces --if-present`. Do not add turbo.

---

## .claude/ — commands vs prompts

### `.claude/commands/` — slash commands

Reusable instructions Claude runs **on demand**, any time, in any session.
Claude Code surfaces these automatically in its `/` menu.

| Type `/` | What it does | When to use it |
|---|---|---|
| `/setup` | Installs deps, syncs env, checks Redis, reports status | First thing in every new worktree session |
| `/plan` | Reads git status + CLAUDE.md, lists pending tasks | When you're not sure what to do next |
| `/test` | Runs jest + tsc + eslint, fixes failures | Before every commit |
| `/audit` | Pre-merge checklist: layers, API key, testids, bundle size | Before merging any phase branch to main |
| `/sync` | Rebases current branch onto latest main | When main has been updated mid-session |
| `/commit` | Stages changes, writes a conventional commit message | When you're ready to commit |

These commands work in **any** worktree, on any phase. Completely generic.

### `.claude/prompts/` — phase kickoff prompts

One-time instructions that define what this worktree session is for.
Not slash commands — reference them manually at the very start of a session.

```
# Say this to Claude at session start:
Read .claude/prompts/phase1.md then begin.
```

| File | Contains |
|---|---|
| `phase1.md` | Scope (apps/api only), P1-1→P1-4 tasks, backend layer rule, done criteria |
| `phase2.md` | Scope (apps/api only), P2-1→P2-5 tasks, Deepgram/Redis rules, done criteria |
| `phase3.md` | Scope (data/ + logic/ only), P3-1→P3-7 tasks, layer rule, XState v5 rule, done criteria |
| `phase4.md` | Scope (ui/ only), P4-1→P4-7 tasks, data-testid requirements, bundle gate |
| `phase5.md` | Full repo, P5-1→P5-6 tasks, NF pass criteria (must use 2 instances for load test) |

These are long and phase-specific — they don't belong in the `/` menu.

---

## Phase task breakdown

Each phase prompt covers these exact tasks. Use this as the source of truth when
writing or checking prompt files.

### Phase 0 — Repo & Monorepo Setup (main branch, already done)
| Task | What |
|---|---|
| P0-1 | npm workspaces scaffold — `apps/api` + `packages/speech-widget`, root `package.json` |
| P0-2 | TypeScript 5.4, ESLint (layer rules), Prettier, Jest, GitHub Actions CI |
| P0-3 | Shared types — `packages/speech-widget/src/data/types.ts` + `apps/api/src/infra/types.ts` |

### Phase 1 — Backend: Infra & Session Management
| Task | What |
|---|---|
| P1-1 | Express app + `pino-http` (correlation ID) + prom-client + `GET /health` + `GET /metrics` |
| P1-2 | `RedisAdapter` (implements `IRedisAdapter`) + `SessionService` (UUID, 30-min TTL) |
| P1-3 | `RateLimitService` — 10 concurrent sessions, 50 opens/min, typed `RateLimitError` |
| P1-4 | `POST /api/session` + `DELETE /api/session/:id` + Zod validation + auth stub (`// TODO: OQ-01`) |

### Phase 2 — Backend: Relay Service & WebSocket Gateway
| Task | What |
|---|---|
| P2-1 | `DeepgramAdapter` — wraps SDK, reads key from env only, keepalive pings, reconnect backoff |
| P2-2 | `RelayService` — EventEmitter, opens Deepgram, Redis Pub/Sub bridge (publish + subscribe) |
| P2-3 | `SpeechController` — delegates to relay/session, child Pino logger with `sessionId` |
| P2-4 | `wsGateway.ts` — WS upgrade on `/ws`, auth stub, binary→audio / JSON→control routing |
| P2-5 | Prometheus: 4 metrics wired and visible at `GET /metrics` after a fake session lifecycle |

### Phase 3 — Frontend: Data & Logic Layers
| Task | Layer | What |
|---|---|---|
| P3-1 | data | `AudioCapture.ts` — `getUserMedia` + `MediaRecorder`, 100ms timeslice, skip empty chunks |
| P3-2 | data | `WsTransport.ts` — WS lifecycle, binary send, reconnect (500ms base, 2×, 30s cap, ±20% jitter) |
| P3-3 | data | `TranscriptClient.ts` — composes P3-1 + P3-2, implements `ITranscriptClient`, parses server frames |
| P3-4 | logic | `recordingMachine.ts` — XState v5 `createMachine`, 5 states, `sessionId` + `error` in context |
| P3-5 | logic | `injectTranscript.ts` — native prototype setter, fires `input` + `change` + `speech:done` events |
| P3-6 | logic | `useRecorder.ts` + `useTranscript.ts` — drive machine + client, call `injectTranscript` on final |
| P3-7 | logic | `SpeechProvider.tsx` + `useWidgetConfig.ts` — context, defaults, required field validation |

### Phase 4 — Frontend: UI Layer
| Task | What |
|---|---|
| P4-1 | `SpeechButton.tsx` — `stateConfig` map, `data-testid="speech-button"` |
| P4-2 | `WaveAnimation.tsx` — 5 CSS bars, `prefers-reduced-motion`, `data-testid="wave-animation"` |
| P4-3 | `TranscriptPreview.tsx` — fade in/out, 600ms delay, `data-testid="transcript-preview"` |
| P4-4 | `StatusBadge.tsx` — shadcn `Badge` destructive, auto-dismiss 4s, `data-testid="error-toast"` |
| P4-5 | `SpeechWidget.tsx` — root, `position:fixed` bottom-right, light/dark/auto theme |
| P4-6 | ESLint layer rule verification — deliberate violation test, confirm CI gate catches it |
| P4-7 | Vite library build (ES + CJS) + CI bundle size gate < 51,200 bytes gzipped |

### Phase 5 — Integration, Load Test & Observability
| Task | What |
|---|---|
| P5-1 | E2E WS test — mock DeepgramAdapter, real Redis, assert `transcript.final` < 800ms |
| P5-2 | Playwright — mock mic, Chromium, all 4 `data-testid` selectors reachable |
| P5-3 | k6/Artillery — 5,000 concurrent WS sessions, **TWO backend instances required** |
| P5-4 | Grafana dashboard + alerts (p95 > 800ms, connections > 4,500) |
| P5-5 | Auth integration — replace all `// TODO: OQ-01` stubs once OQ-01 is resolved |
| P5-6 | npm publish + minimal React host app smoke test |

---

## Key concept: speech-widget is a library, not an app

| | React App | speech-widget (this project) |
|---|---|---|
| Has `index.html` | ✅ | ❌ |
| Has a dev server (`localhost:3000`) | ✅ | ❌ |
| Has pages / router | ✅ | ❌ |
| You open it in a browser | ✅ | ❌ |
| Vite mode | `app` | `library` |
| Output | `index.html` + assets | `speech-widget.es.js` |
| React bundled inside | ✅ | ❌ (peerDependency — host provides it) |

The host app installs the widget and renders it:

```tsx
import { SpeechWidget } from '@voice-adapter/speech-widget'

<SpeechWidget
  apiUrl={import.meta.env.VITE_API_URL}
  targetSelector="#agent-input"
  lang="en-US"
  theme="auto"
  onTranscript={(text) => console.log('Transcribed:', text)}
  onError={(err) => console.error(err.code, err.message)}
/>
```

---

## Parallel development workflow

Phases 1 and 3 can run in parallel (backend vs frontend streams) immediately after Phase 0.
Phases 2 and 4 start only after their prerequisite phase is merged to main.

```
main (Phase 0) ──────────────────────────────────────────────► main
                    │                        │
          ┌─────────┴──────────┐   ┌─────────┴──────────┐
          │  Stream A          │   │  Stream B          │
          │  Backend           │   │  Frontend          │
          │                    │   │                    │
          │  Phase 1 (P1-1→4)  │   │  Phase 3 (P3-1→7)  │
          │       ↓ merge      │   │       ↓ merge      │
          │  Phase 2 (P2-1→5)  │   │  Phase 4 (P4-1→7)  │
          │       ↓ merge      │   │       ↓ merge      │
          └─────────┬──────────┘   └─────────┬──────────┘
                    └────────────┬────────────┘
                                 │
                          Phase 5 (P5-1→6)
```

### Terminal layout

```bash
# Terminal 1 — Phase 1 (Backend Infra)
cd ~/voice-adapter-backend-infra
claude
# Session start: "Read .claude/prompts/phase1.md then begin."
# During session: /setup  /plan  /test  /commit  /audit

# Terminal 2 — Phase 2 (Relay + WS)  ← start after Phase 1 merged
cd ~/voice-adapter-relay-ws
claude
# Session start: "Read .claude/prompts/phase2.md then begin."
# During session: /setup  /plan  /test  /commit  /audit

# Terminal 3 — Phase 3 (Frontend Data + Logic)  ← parallel with Terminal 1
cd ~/voice-adapter-frontend-data
claude
# Session start: "Read .claude/prompts/phase3.md then begin."
# During session: /setup  /plan  /test  /commit  /audit

# Terminal 4 — Phase 4 (Frontend UI)  ← start after Phase 3 merged
cd ~/voice-adapter-frontend-ui
claude
# Session start: "Read .claude/prompts/phase4.md then begin."
# During session: /setup  /plan  /test  /commit  /audit

# Terminal 5 — Phase 5 (Integration)  ← start after Phase 2 + Phase 4 both merged
cd ~/voice-adapter-integration
claude
# Session start: "Read .claude/prompts/phase5.md then begin."
# During session: /setup  /plan  /test  /sync  /audit
```

---

## Typical session flow inside Claude Code

```
1.  cd into the worktree, run: claude
2.  Say: "Read .claude/prompts/phase1.md then begin."   ← loads phase context once
3.  /setup                                               ← deps, env, Redis check
4.  /plan                                                ← what needs doing today
5.  [ Claude writes code ]
6.  /test                                                ← verify nothing is broken
7.  /commit                                              ← stage + conventional commit
8.  [ Claude writes more code ]
9.  /test  →  /commit                                    ← repeat
10. /audit                                               ← before merging to main
11. /sync                                                ← if main updated mid-session
```

---

## Architecture rules (enforced — never violate)

### Frontend layer dependency (ADR-04)

```
ui/  →  logic/  →  data/
```

- `ui/` imports from `logic/` only
- `logic/` imports from `data/` only
- `data/` imports nothing internal — zero React, zero XState
- Enforced by ESLint `no-restricted-imports` in `eslint.config.ts` — CI fails on violations
- **ESLint rule must be set up (P0-2) before any `ui/` or `logic/` code is written**

### Backend layer dependency

```
routes/  →  controllers/  →  services/  →  infra/
```

- Services depend on **interfaces** (`IRedisAdapter`, `IDeepgramAdapter`), never concrete classes
- Controllers have no `express` or `ws` imports — those live in routes only
- `container.ts` is the only place that wires concrete classes to interfaces

### Other hard rules

| Rule | Source | Consequence of violation |
|---|---|---|
| `DEEPGRAM_API_KEY` server-only — never in widget bundle | ADR-01, NF-07 | CI bundle scan fails |
| XState v5 API: `createMachine` + `createActor` — never `interpret` | ADR-03 | Silent v4 misbehaviour |
| No boolean flags (`isRecording`, `isProcessing`) — state machine only | ADR-03 | Impossible states accumulate |
| `data-testid` on all 4 interactive elements | spec §12.5 | Playwright E2E fails |
| Bundle < 51,200 bytes gzipped | NF-02 | CI gate fails |
| Load test must use 2 backend instances | ADR-06 | Redis Pub/Sub reconnect path untested |

---

## Merge order

```
Phase 0  →  already on main ✓
Phase 1  →  merge to main  (Phase 2 worktree branches from updated main)
Phase 3  →  merge to main  (Phase 4 worktree branches from updated main)
Phase 2  →  merge to main  (requires Phase 1 types in main)
Phase 4  →  merge to main  (requires Phase 3 types in main)
Phase 5  →  merge to main  (requires Phase 2 + Phase 4 both in main)
```

### Merging a completed phase

```bash
# 1. In the worktree — run /audit inside Claude Code first
cd ~/voice-adapter-backend-infra

# 2. Push the branch
git push origin phase/1-backend-infra

# 3. In the main worktree — merge
cd ~/voice-adapter
git fetch origin
git merge phase/1-backend-infra --no-ff -m "merge(p1): backend infra & session management"

# 4. Clean up
git worktree remove ~/voice-adapter-backend-infra
git branch -d phase/1-backend-infra
```

### Pulling main updates into a running worktree

```bash
# Option A: inside Claude Code (recommended)
/sync    ← handles fetch + rebase + conflict resolution

# Option B: manually
cd ~/voice-adapter-frontend-data
git fetch origin
git rebase origin/main      # preferred if branch not yet pushed
git merge origin/main       # if branch is already on the remote
```

---

## Common git worktree commands

```bash
# See all worktrees and their branches
git worktree list

# Add a worktree (e.g. for a hotfix)
git worktree add ../voice-adapter-hotfix -b hotfix/session-ttl main

# Lock a worktree against accidental deletion
git worktree lock ../voice-adapter-backend-infra --reason "P1 active"

# Remove a finished worktree (deletes directory + deregisters)
git worktree remove ../voice-adapter-backend-infra

# Prune stale entries (if a directory was deleted manually)
git worktree prune

# Claude Code native worktree — quick experiments, auto-cleaned on exit
claude --worktree experiment-xstate
claude -w hotfix-redis-ttl
```

---

## What each file does

| File | Purpose |
|---|---|
| `package.json` (root) | npm workspaces definition (`apps/*`, `packages/*`), workspace-level scripts |
| `package.json` (apps/api) | Backend deps: express, ws, ioredis, pino, prom-client, @deepgram/sdk, zod |
| `package.json` (packages/speech-widget) | Library deps: xstate. peerDep: react ≥18. devDeps: vite, jest, @testing-library/react |
| `docker-compose.yml` | Redis + API containers for local dev |
| `.env.example` | Copy to `.env`, fill in `DEEPGRAM_API_KEY` |
| `CLAUDE.md` | Authoritative build guide — Claude reads this at every session start |
| `packages/speech-widget/src/data/types.ts` | Shared frontend types: `SpeechConfig`, `RecordingState`, `TranscriptEvent`, `SpeechError`, `ITranscriptClient` |
| `apps/api/src/infra/types.ts` | Backend interfaces: `IRelayService`, `ISessionService`, `IRateLimitService`, `IDeepgramAdapter`, `IRedisAdapter` |
| `apps/api/src/infra/container.ts` | Dependency injection — the ONLY place that `new`s concrete infra classes |
| `.claude/commands/plan.md` | `/plan` slash command |
| `.claude/commands/test.md` | `/test` slash command |
| `.claude/commands/setup.md` | `/setup` slash command |
| `.claude/commands/audit.md` | `/audit` slash command |
| `.claude/commands/sync.md` | `/sync` slash command |
| `.claude/commands/commit.md` | `/commit` slash command |
| `.claude/prompts/phase1.md` | Phase 1 kickoff — P1-1→P1-4, backend layer rule, done criteria |
| `.claude/prompts/phase2.md` | Phase 2 kickoff — P2-1→P2-5, Deepgram/Redis rules, done criteria |
| `.claude/prompts/phase3.md` | Phase 3 kickoff — P3-1→P3-7, layer rule, XState v5, done criteria |
| `.claude/prompts/phase4.md` | Phase 4 kickoff — P4-1→P4-7, data-testid list, bundle gate |
| `.claude/prompts/phase5.md` | Phase 5 kickoff — P5-1→P5-6, NF checklist, 2-instance load test requirement |
| `apps/api/tsconfig.json` | Backend TypeScript — CommonJS output, no Vite |
| `packages/speech-widget/vite.config.ts` | Library mode — ES + CJS output, React externalized, no `index.html` |

---

## First commands to run (on your machine)

```bash
# 1. Clone the repo
git clone git@github.com:yourorg/voice-adapter.git
cd voice-adapter

# 2. Copy the env file and fill in your Deepgram key
cp .env.example .env

# 3. Start Redis
docker-compose up redis -d

# 4. Install dependencies (npm workspaces — no pnpm, no turbo)
npm install

# 5. Confirm the workspace builds clean
npm run build --workspaces --if-present

# 6. Create worktrees for the two streams you're starting today
git worktree add ../voice-adapter-backend-infra  -b phase/1-backend-infra  main
git worktree add ../voice-adapter-frontend-data  -b phase/3-frontend-data  main

# 7. Install deps in each worktree
cd ../voice-adapter-backend-infra && npm install
cd ../voice-adapter-frontend-data && npm install

# 8. Open Claude Code in each worktree (separate terminals)
#    Terminal A:
cd ~/voice-adapter-backend-infra && claude
#    → say: "Read .claude/prompts/phase1.md then begin."

#    Terminal B:
cd ~/voice-adapter-frontend-data && claude
#    → say: "Read .claude/prompts/phase3.md then begin."
```

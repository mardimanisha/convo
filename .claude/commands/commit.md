# /commit — Stage Changes & Write a Conventional Commit

Run after `/test` passes. Never commit with failing tests.

## Steps

### 1. Review what will be staged
```bash
git diff --stat
git status --short
```

### 2. Stage all relevant changes
```bash
git add -A
```
If some files should not be committed yet, stage selectively:
```bash
git add apps/api/src/...
git add packages/speech-widget/src/...
```

### 3. Write the commit message (Conventional Commits format)

**Format:**
```
<type>(<scope>): <short summary in present tense, ≤72 chars>

<body — what was built and why, 2–5 sentences>

<footer — refs, breaking changes>
```

**Types:**
| Type | Use for |
|------|---------|
| `feat` | New feature / new file implementing spec |
| `fix` | Bug fix |
| `test` | Tests added or fixed |
| `refactor` | Code change without behaviour change |
| `chore` | Tooling, config, deps |
| `ci` | GitHub Actions / CI changes |
| `docs` | Comments, README updates |

**Scopes:** `api`, `widget`, `infra`, `session`, `relay`, `ws`, `audio`, `transcript`, `ui`, `types`, `ci`

**Examples:**
```
feat(session): implement SessionService with Redis TTL sliding window

Creates create/get/touch/delete methods backed by ioredis.
Uses UUIDv4 for sessionId generation. TTL resets on every touch.
All methods depend on IRedisAdapter interface for testability.

Refs: P1-2
```

```
feat(relay): add RelayService with Redis Pub/Sub bridge

Opens Deepgram streams per session and publishes transcript events
to Redis channel transcript:{sessionId}. Subscribes to same channel
to handle the reconnect scenario (ADR-06).

Refs: P2-2
```

```
feat(ws): implement WsTransport with exponential backoff reconnect

Reconnects from 500ms base, doubling per attempt, capped at 30s with
±20% jitter. Sends X-Session-Id and Authorization headers on upgrade
(auth header stubbed with TODO: OQ-01).

Refs: P3-2
```

### 4. Commit
```bash
git commit -m "<message>"
```

### 5. Confirm
```bash
git log --oneline -3
```

Do not use `--no-verify` or bypass pre-commit hooks.

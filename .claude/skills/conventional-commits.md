# Skill: Conventional Commit Messages

## Format

```
<type>(<scope>): <summary, present tense, ≤72 chars>

<body — what and why, 2–5 sentences>

Refs: <task ID>
```

## Types

| Type | When to use |
|------|-------------|
| `feat` | New implementation file or feature |
| `fix` | Bug fix |
| `test` | Tests only (no production code change) |
| `refactor` | Behaviour-unchanged restructure |
| `chore` | Config, tooling, dependency updates |
| `ci` | GitHub Actions / CI pipeline changes |
| `docs` | README, comments, CLAUDE.md updates |

## Scopes for this project

`api` · `widget` · `infra` · `session` · `relay` · `ws` · `audio` · `transcript` · `ui` · `types` · `ci` · `docker` · `metrics`

## Examples

```
feat(session): implement SessionService with sliding Redis TTL

Adds create/get/touch/delete backed by ioredis via IRedisAdapter interface.
Uses UUIDv4 for sessionId generation. TTL resets to 1800s on every touch() call.
IRedisAdapter does not expose incr/decr — those live only in RateLimitService
via raw ioredis pipeline for atomic operations.

Refs: P1-2
```

```
feat(session): add RateLimitService with atomic Redis increment

Enforces 10 concurrent sessions and 50 opens/min per clientId using ioredis
pipelines (INCR + EXPIRE). Always rolls back the concurrent count before throwing
RateLimitError to prevent drift. Uses raw ioredis client, not IRedisAdapter.

Refs: P1-3
```

```
feat(relay): add RelayService with Redis Pub/Sub bridge for ADR-06

Opens Deepgram streams per session and publishes transcript events to
transcript:{sessionId} channel. Subscribes to same channel to relay events
to the WebSocket client after a reconnect to a different instance (ADR-06).
Decrements wsConnectionsActive gauge on closeSession.

Refs: P2-2
```

```
feat(ws): implement WebSocket gateway with Zod frame validation

Upgrades HTTP on /ws, routes binary frames to onAudioChunk and JSON
frames to onControlMessage. Rejects malformed JSON with error frame
(no server crash). Sets X-Session-Id response header for sticky routing.
Auth header validation stubbed — TODO: OQ-01.

Refs: P2-4
```

```
feat(audio): implement AudioCapture wrapping getUserMedia and MediaRecorder

Emits chunk events at 100ms timeslice using audio/webm;codecs=opus format.
Guards against empty chunks (e.data.size > 0). Only class in the codebase
that calls getUserMedia directly — Logic layer mocks this in tests.

Refs: P3-1
```

```
feat(ws): implement WsTransport with exponential backoff reconnect

Sends X-Session-Id header on connect for load-balancer sticky routing.
Reconnect: 500ms base delay, doubles per attempt, capped at 30s, ±20% jitter.
Auth header forwarding stubbed — TODO: OQ-01.

Refs: P3-2
```

```
feat(transcript): implement recordingMachine using XState v5

Five-state machine: idle → requesting → recording → processing → error.
Uses createMachine + createActor (v5 API — no interpret). Invoked service
named requestPermission. No boolean flags anywhere (ADR-03).

Refs: P3-4
```

```
ci(bundle): add gzip bundle size gate — fail CI if widget exceeds 50KB

Builds widget in library mode using npm workspace script and asserts gzipped
output < 51200 bytes. Gate runs on every PR. Also checks that DEEPGRAM_API_KEY
does not appear in the bundle (ADR-01, NF-07).

Refs: P4-7, NF-02
```

## Rules

1. Summary line is present tense ("implement", not "implemented").
2. No period at the end of the summary line.
3. Body required for `feat` and `fix`; optional for small `chore`/`ci`.
4. Always include `Refs:` with task IDs (P1-1, P2-3, NF-02, OQ-01, etc.).
5. Never use `--no-verify` to skip pre-commit hooks.
6. One logical change per commit — do not bundle unrelated files.

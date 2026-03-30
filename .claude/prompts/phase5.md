# Phase 5 — Integration, Load Test & Observability

> Read this file once at the start of your session in the `voice-adapter-integration` worktree.
> After reading, run `/setup` then `/plan`.

## Prerequisites

**Both** Phase 2 (backend relay) and Phase 4 (frontend UI) must be merged to `main`.
Run `/sync` to get the latest `main` before starting any work.

## Context

You are validating the complete system: end-to-end WebSocket integration, Playwright browser tests,
load testing at 5,000 concurrent sessions, Grafana observability, auth integration, and npm publish.

**Worktree:** `~/voice-adapter-integration`
**Branch:** `phase/5-integration`
**Package manager:** npm (not pnpm)
**Stack:** TypeScript 5.4, Jest 29, Playwright, k6 or Artillery, Prometheus, Grafana, Docker Compose

---

## Scope — Tasks and pass criteria

### P5-1: End-to-end WebSocket integration test

**What to build:** Jest integration test that:
1. Spins up the real Express/WS server with a **mock** `DeepgramAdapter` (returns fake transcripts).
2. Opens a WebSocket client from the test process.
3. Sends: `session.open` JSON → binary audio chunks → `session.close` JSON.
4. Asserts `transcript.final` received within **800ms**.

**Run with real Redis** via Docker Compose:
```bash
docker compose up redis -d
REDIS_URL=redis://localhost:6379 npm run test --workspace=apps/api -- --testPathPattern=e2e
```

**Pass criteria:**
- Full message sequence completes without errors.
- `transcript.final` arrives within 800ms.
- Server logs show session lifecycle (pino JSON with `sessionId`).

---

### P5-2: Playwright browser E2E

**What to build:** Playwright test suite targeting a minimal demo page embedding `SpeechWidget`.

Demo page:
```tsx
// demo/index.tsx
import { SpeechWidget } from '@{orgname}/speech-widget'
<textarea id="agent-input" placeholder="Type or speak..." />
<SpeechWidget apiUrl={wsUrl} targetSelector="#agent-input" lang="en-US" theme="auto" />
```

**Microphone mock:**
```typescript
await context.grantPermissions(['microphone'])
// Inject fake getUserMedia returning prerecorded audio stream
await page.addInitScript(() => { /* override navigator.mediaDevices.getUserMedia */ })
```

**Test sequence:**
1. `data-testid="speech-button"` renders and is clickable.
2. Click mic → `data-testid="wave-animation"` appears.
3. Interim text appears in `data-testid="transcript-preview"`.
4. Stop → final text injected into `#agent-input` textarea.

**Pass criteria:** All 4 assertions pass in Chromium. All `data-testid` attributes reachable.

---

### P5-3: Load test — 5,000 concurrent WebSocket sessions

**Must run with TWO Node.js instances** to validate ADR-06 (Redis Pub/Sub reconnect).
A single-instance load test is **insufficient**.

```bash
docker compose up --scale api=2 -d
```

**k6 script outline:**
```javascript
import ws from 'k6/ws'
export const options = { vus: 5000, duration: '30s' }
export default function () {
  ws.connect(wsUrl, {}, (socket) => {
    const sessionId = uuidv4()
    socket.send(JSON.stringify({ type: 'session.open', sessionId, lang: 'en-US' }))
    // Send 50 binary chunks at 100ms intervals (= 5 seconds of audio)
    for (let i = 0; i < 50; i++) {
      socket.sendBinary(new ArrayBuffer(1600))
      sleep(0.1)
    }
    socket.send(JSON.stringify({ type: 'session.close', sessionId }))
  })
}
```

**Pass criteria (NF-01, NF-03, NF-04):**
- p95 transcript latency < 800ms
- Memory per session < 100KB
- Zero connection errors under sustained load
- Validated with TWO backend instances

---

### P5-4: Grafana dashboard & alerting

**What to build:**
1. `prometheus.yml` scrape config targeting `GET /metrics` on all API instances.
2. Grafana dashboard JSON with 5 panels:
   - `ws_connections_active` — line chart, all instances overlaid
   - `transcript_latency_ms` p50/p95/p99 — 5-minute rolling window
   - `audio_bytes_relayed_total` rate — area chart
   - `session_open_errors_total` rate by `reason` — bar chart
   - Instance memory RSS (node_exporter)
3. Alerts:
   - p95 latency > 800ms → fire
   - `ws_connections_active` > 4,500 per instance → fire

**Pass criteria:**
- All panels populate after a test recording session.
- Alerts fire when threshold is breached in staging.

---

### P5-5: Auth integration — unblocks OQ-01

Only start once OQ-01 is resolved. Find all stubs:
```bash
grep -rn "TODO: OQ-01" apps/ packages/
```

**If JWT:**
```bash
npm install @types/jsonwebtoken jsonwebtoken --workspace=apps/api
```
- Validate JWT signature in `wsGateway.ts`.
- Widget `WsTransport`: forward token in `Authorization: Bearer <token>` WS upgrade header.

**If API key:**
- Validate against a Redis allowlist (`SET auth:apikey:{key} 1`).

**Integration test pass criteria:**
- Valid token → WS upgrade succeeds (101).
- Invalid token → server closes with code 4401.
- Missing token → server closes with code 4401.

---

### P5-6: npm publish & smoke test

```bash
# Final bundle check
npm run build --workspace=packages/speech-widget
BYTES=$(find packages/speech-widget/dist -name "*.js" | xargs gzip -c | wc -c)
echo "Final bundle: ${BYTES} bytes"

# Publish
npm publish --workspace=packages/speech-widget --access public
```

**Smoke test:** Clean React project, install published package, confirm full user flow.

---

## Non-Functional Requirements — Final Verification

| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| NF-01 | Transcript latency | p95 < 800ms | P5-3 |
| NF-02 | Widget bundle size | < 50KB gzipped | P4-7 gate |
| NF-03 | WS RAM per session | < 100KB | P5-3 |
| NF-04 | Concurrent WS sessions | 5,000+ per instance | P5-3 |
| NF-05 | Structured logs + correlation IDs | Required | P1-1 |
| NF-06 | Prometheus metrics endpoint | Required | P2-5 |
| NF-07 | Deepgram key never client-side | Required | Audit |
| NF-08 | Horizontally scalable | Required | P5-3 (2-instance) |

Run a final `/audit` covering all 8 NF items before declaring the project complete.

## Done criteria for Phase 5

- [ ] P5-1: WS integration test passes — `transcript.final` within 800ms
- [ ] P5-2: All Playwright assertions pass in Chromium
- [ ] P5-3: Load test passes all NF thresholds with 2 instances
- [ ] P5-4: Grafana dashboard populated; alerts configured
- [ ] P5-5: Auth integration complete (or waived with documented OQ-01 resolution)
- [ ] P5-6: Widget published; smoke test passes
- [ ] All 8 NF items verified

## Merge instructions (when done)

```bash
git push origin phase/5-integration
# In ~/voice-adapter:
git fetch origin
git merge phase/5-integration --no-ff -m "merge(p5): integration, load test & observability"
git worktree remove ~/voice-adapter-integration
git branch -d phase/5-integration
```

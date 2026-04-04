# Load Test — P5-3

Validates NF-01, NF-03, NF-04, and ADR-06 using [k6](https://k6.io).

## Pass criteria

| Metric | Threshold | NF ref |
|--------|-----------|--------|
| `transcript_latency_ms` p95 | < 800ms | NF-01 |
| `ws_session_errors` total | = 0 | NF-04 |
| Server memory per session | < 100KB | NF-03 |
| Concurrent sessions sustained | 5,000 | NF-04 |

> **ADR-06 requirement:** Must run with `--scale api=2`. A single-instance run
> does NOT exercise the Redis Pub/Sub reconnect path and cannot validate ADR-06.

---

## Prerequisites

**k6:**
```bash
# macOS
brew install k6

# Ubuntu/Debian (official PPA)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install k6

# Windows
choco install k6
```

**Docker + Docker Compose v2**

---

## Run the load test

### 1. Start the two-instance stack

```bash
# From the repo root
docker compose -f docker-compose.loadtest.yml up --scale api=2 -d
```

Verify both api replicas and nginx are running:
```bash
docker compose -f docker-compose.loadtest.yml ps
```

### 2. Run k6

```bash
k6 run --env WS_URL=ws://localhost/ws load-test/k6.js
```

### 3. Tear down

```bash
docker compose -f docker-compose.loadtest.yml down
```

---

## Interpreting results

k6 prints a summary after the run. Look for:

```
transcript_latency_ms..........: avg=NNms  p(90)=NNms  p(95)=NNms ✓ threshold
ws_session_errors..............: 0        ✓ threshold
WebSocket upgrade succeeded....: NNN%
```

Both thresholds must show `✓` for the test to pass.

---

## Checking memory per session (NF-03)

While the test is running, in a separate terminal:

```bash
# RSS memory of each api replica
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}"
```

With 5,000 sessions split across 2 instances (~2,500 each):
- Total RSS per instance should be **< 250MB** (2,500 × 100KB)
- If RSS > 250MB per instance → NF-03 violation

---

## Using real Deepgram (full end-to-end test)

By default `MOCK_DEEPGRAM=true`. To test with a real Deepgram subscription:

```bash
MOCK_DEEPGRAM=false DEEPGRAM_API_KEY=your_key \
  docker compose -f docker-compose.loadtest.yml up --scale api=2 -d

k6 run --env WS_URL=ws://localhost/ws load-test/k6.js
```

> Note: Real Deepgram load tests consume your API quota. Check your plan's
> concurrent stream limit (OQ-03) before running at full 5,000 VU scale.

---

## Latency metric definition

`transcript_latency_ms` measures from **`session.close` sent** → **`transcript.final` received**.

This is the "speech end → text in input" latency defined in NF-01, not the
total session duration. It measures the relay hop latency (Deepgram processing +
Redis pub/sub + WS delivery) independent of how long the user spoke.

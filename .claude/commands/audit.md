# /audit — Pre-Merge Checklist

Run this before merging any phase branch into `main`. Every item must pass.

## Checklist

### Architecture & Layers

- [ ] **ADR-04 layer rule**: Run `npm run lint --workspaces --if-present` — zero `no-restricted-imports` violations.
  - `ui/` does not import from `data/`
  - `logic/` does not import from `ui/`
  - `data/` has no internal imports
  ```bash
  npm run lint --workspaces --if-present 2>&1 | grep "no-restricted-imports" \
    && echo "❌ Layer violations!" || echo "✅ Layer rule OK"
  ```

- [ ] **ADR-01 API key**: Deepgram key is never in frontend bundle.
  ```bash
  grep -r "DEEPGRAM_API_KEY" packages/speech-widget/dist 2>/dev/null \
    && echo "❌ KEY IN BUNDLE" || echo "✅ Key not in bundle"
  ```

- [ ] **ADR-03 XState**: No boolean state flags (`isRecording`, `isProcessing`, etc.) in `logic/`.
  ```bash
  grep -rn "isRecording\|isProcessing\|isIdle\|isError" packages/speech-widget/src/logic/ \
    && echo "❌ Boolean flags found" || echo "✅ No boolean flags"
  ```

- [ ] **Backend layers**: Controllers have no Express/ws imports; services depend only on interfaces.
  ```bash
  grep -rn "from 'express'\|from 'ws'" apps/api/src/controllers/ \
    && echo "❌ Controllers import express/ws" || echo "✅ Controller imports clean"
  ```

### Testing

- [ ] All tests pass with zero failures:
  ```bash
  npm run test --workspaces --if-present 2>&1 | tail -10
  ```

- [ ] TypeScript compiles with zero errors:
  ```bash
  npm run tsc --workspaces --if-present 2>&1 | tail -10
  ```

### Frontend-Specific (Phase 3 & 4 only)

- [ ] **data-testid attributes** present on all interactive elements:
  ```bash
  grep -rn 'data-testid' packages/speech-widget/src/ui/ \
    | grep -E "speech-button|wave-animation|transcript-preview|error-toast" | wc -l
  ```
  Expected: ≥ 4 matches.

- [ ] **Bundle size** < 50KB gzipped (NF-02):
  ```bash
  npm run build --workspace=packages/speech-widget
  BYTES=$(find packages/speech-widget/dist -name "*.js" | xargs gzip -c | wc -c)
  echo "Bundle: ${BYTES} bytes"
  [ "$BYTES" -lt 51200 ] && echo "✅ OK" || echo "❌ Over budget"
  ```

- [ ] **XState only in logic/**: Not imported in `data/` or `ui/`.
  ```bash
  grep -rn "from 'xstate'" packages/speech-widget/src/data/ packages/speech-widget/src/ui/ 2>/dev/null \
    && echo "❌ XState in wrong layer" || echo "✅ XState in logic/ only"
  ```

### Backend-Specific (Phase 1 & 2 only)

- [ ] **OQ-01 stub** is present and findable:
  ```bash
  grep -rn "TODO: OQ-01" apps/api/src/ \
    && echo "✅ Stub marked" || echo "⚠️  OQ-01 stub not found — was auth resolved?"
  ```

- [ ] **Redis key schema** matches spec (`session:`, `ratelimit:`, `transcript:`):
  ```bash
  grep -rn "session:\|ratelimit:\|transcript:" apps/api/src/ | head -10
  ```

- [ ] **Prometheus metrics** all registered:
  ```bash
  grep -rn "ws_connections_active\|audio_bytes_relayed_total\|transcript_latency_ms\|session_open_errors_total" \
    apps/api/src/
  ```

- [ ] **No turbo references** left in any config:
  ```bash
  grep -rn "turbo" . --include="*.json" --include="*.ts" --include="*.yml" \
    && echo "❌ turbo reference found — project uses npm workspaces only" \
    || echo "✅ No turbo references"
  ```

### Final

- [ ] `git diff origin/main...HEAD --stat` — review the diff, no unintended files.
- [ ] Conventional commit messages on all commits in branch.
- [ ] No `console.log` left in production code (use Pino logger).
  ```bash
  grep -rn "console\.log" apps/api/src/ packages/speech-widget/src/ \
    && echo "❌ console.log found" || echo "✅ No console.log"
  ```

Print PASS/FAIL for the whole audit. Do not merge if any item fails.

# /test — Run All Checks & Fix Failures

Run before every commit. Do not commit until all checks pass.

## Steps

### 1. TypeScript — zero errors required
```bash
npm run tsc --workspaces --if-present 2>&1
```
Fix every error before continuing.

### 2. ESLint — zero violations required
```bash
npm run lint --workspaces --if-present 2>&1
```
Pay special attention to `no-restricted-imports` violations (ADR-04 layer rule):
- `ui/` must not import from `data/`
- `logic/` must not import from `ui/`
- `data/` must not import from `logic/` or `ui/`

Fix all violations. Never disable the layer rule with `eslint-disable`.

### 3. Unit tests
```bash
npm run test --workspaces --if-present 2>&1
```
All tests must pass. No skipped tests count as passing.

### 4. Bundle size gate (frontend only — skip in backend worktrees)
```bash
if [ -f packages/speech-widget/vite.config.ts ]; then
  npm run build --workspace=packages/speech-widget
  BUNDLE=$(find packages/speech-widget/dist -name "*.js" | xargs gzip -c | wc -c)
  echo "Bundle gzipped: ${BUNDLE} bytes (limit: 51200)"
  [ "$BUNDLE" -lt 51200 ] \
    && echo "✅ Bundle within limit" \
    || echo "❌ Bundle EXCEEDS 50KB — investigate with rollup-plugin-visualizer"
fi
```

### 5. API key check (frontend only — skip in backend worktrees)
```bash
if [ -d packages/speech-widget/dist ]; then
  grep -r "DEEPGRAM_API_KEY" packages/speech-widget/dist \
    && echo "❌ API key found in bundle!" \
    || echo "✅ No API key in bundle"
fi
```

### 6. Summary
Print ✅/❌ for each step. Do not proceed to `/commit` until all are ✅.

If tests fail: fix them. Do not comment them out. Do not add `// @ts-ignore` to pass TypeScript.

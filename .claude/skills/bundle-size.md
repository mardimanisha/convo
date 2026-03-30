# Skill: Bundle Size Management (NF-02)

## Budget

- **Limit:** 50KB gzipped (51,200 bytes)
- **XState v5 baseline:** ~30KB (60% of budget — watch from day one)
- **React + ReactDOM:** excluded (peerDependency — host app provides them)

## Check bundle size

```bash
npm run build --workspace=packages/speech-widget
BYTES=$(find packages/speech-widget/dist -name "*.js" | xargs gzip -c | wc -c)
echo "Bundle: ${BYTES} bytes (limit: 51200)"
[ "$BYTES" -lt 51200 ] && echo "✅ Within budget" || echo "❌ Over budget — investigate"
```

## Vite library mode config

```typescript
// packages/speech-widget/vite.config.ts
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
      // These are provided by the host app — do NOT bundle them
      external: ['react', 'react-dom', 'xstate'],
      output: {
        globals: {
          react:      'React',
          'react-dom': 'ReactDOM',
          xstate:     'XState',
        },
      },
    },
    minify:    'esbuild',
    sourcemap: false,
  },
})
```

## Investigate oversize bundle

```bash
npm install --save-dev rollup-plugin-visualizer --workspace=packages/speech-widget

# Add to vite.config.ts temporarily:
import { visualizer } from 'rollup-plugin-visualizer'
plugins: [react(), visualizer({ filename: 'dist/stats.html', open: true })]

# Build and inspect
npm run build --workspace=packages/speech-widget
open packages/speech-widget/dist/stats.html
```

## Common causes of budget overrun

| Cause | Fix |
|-------|-----|
| XState imported in `data/` layer | Move XState usage to `logic/` only — ESLint rule blocks this |
| Entire `xstate` package not tree-shaken | Only import named: `import { createMachine, assign } from 'xstate'` |
| `react`/`react-dom` bundled accidentally | Verify they are in `rollupOptions.external` |
| Unused icons from a barrel export | Import icons individually: `import { Mic } from 'lucide-react/Mic'` |
| Dev-only debug code in production | Guard with `if (import.meta.env.DEV)` |

## API key check — always run alongside bundle size check

```bash
grep -r "DEEPGRAM_API_KEY" packages/speech-widget/dist 2>/dev/null \
  && echo "❌ API KEY IN BUNDLE — CRITICAL (ADR-01, NF-07)" \
  || echo "✅ No API key in bundle"
```

## CI gate (in `.github/workflows/ci.yml`)

```yaml
- name: Build widget
  run: npm run build --workspace=packages/speech-widget

- name: Bundle size gate (NF-02)
  run: |
    BYTES=$(find packages/speech-widget/dist -name "*.js" | xargs gzip -c | wc -c)
    echo "Bundle size: ${BYTES} bytes (limit: 51200)"
    if [ "$BYTES" -gt 51200 ]; then
      echo "❌ Bundle exceeds 50KB gzip limit"
      exit 1
    fi
    echo "✅ Bundle within limit"

- name: API key check (ADR-01)
  run: |
    if grep -r "DEEPGRAM_API_KEY" packages/speech-widget/dist 2>/dev/null; then
      echo "❌ DEEPGRAM_API_KEY found in widget bundle!"
      exit 1
    fi
    echo "✅ No API key in bundle"
```

## `index.ts` export surface — keep it minimal

```typescript
// packages/speech-widget/src/index.ts
// Only export what host apps need — do not re-export internal implementation details
export { SpeechWidget } from './ui/SpeechWidget'
export type {
  SpeechConfig,
  RecordingState,
  TranscriptEvent,
  SpeechErrorCode,
} from './data/types'
export { SpeechError } from './data/types'
```

Exporting internal classes like `AudioCapture`, `WsTransport`, or `TranscriptClient` from the
barrel would invite misuse and may prevent tree-shaking of those modules.

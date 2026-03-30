# Phase 4 — Frontend: UI Layer

> Read this file once at the start of your session in the `voice-adapter-frontend-ui` worktree.
> After reading, run `/setup` then `/plan`.

## Prerequisites

Phase 3 must be merged to `main` before starting this phase.
Run `/sync` first to pull Phase 3 logic and data layers.

## Context

You are building the presentational React components for the speech widget.
All UI components are **purely presentational** — they read state from context and call callbacks.
They contain NO business logic, NO XState, NO network calls, NO audio APIs.

**Worktree:** `~/voice-adapter-frontend-ui`
**Branch:** `phase/4-frontend-ui`
**Package manager:** npm (not pnpm)
**Stack:** TypeScript 5.4, React 18, Vite 5 (library mode), Tailwind CSS (utility classes only)
**Tests:** Jest 29, jest-environment-jsdom, @testing-library/react 15

---

## Scope — What you build in this phase

| Task | Files to create | Done when |
|------|----------------|-----------|
| P4-1 | `packages/speech-widget/src/ui/SpeechButton.tsx` | RTL: all 5 RecordingState variants render correctly; data-testid present |
| P4-2 | `packages/speech-widget/src/ui/WaveAnimation.tsx`, `StatusBadge.tsx`, `TranscriptPreview.tsx` | RTL: correct rendering per state, data-testid present, a11y respected |
| P4-3 | `packages/speech-widget/src/ui/SpeechWidget.tsx` | RTL: full widget renders; onTranscript/onError callbacks fire; theme classes applied |
| P4-4 | `packages/speech-widget/src/ui/StatusBadge.tsx` | RTL: auto-dismisses after 4s (jest fake timers); data-testid="error-toast" |
| P4-5 | Wires all components into `SpeechWidget` root | RTL: floating container renders at fixed bottom-right |
| P4-6 | ESLint layer rule verification | Deliberate ui→data violation detected; removal passes ESLint |
| P4-7 | `packages/speech-widget/vite.config.ts` final + bundle gate | Build passes; gzipped bundle < 51,200 bytes |

---

## CRITICAL — Layer dependency rule (ADR-04)

```
ui/  →  logic/  →  data/
```

`ui/` files may **only** import from `logic/`. Never directly from `data/`.

```bash
# Verify before every commit:
npm run lint --workspaces --if-present 2>&1 | grep "no-restricted-imports" \
  && echo "❌ LAYER VIOLATION" || echo "✅ OK"
```

---

## SpeechButton requirements (P4-1)

```typescript
const stateConfig: Record<RecordingState, ButtonConfig> = {
  idle:       { icon: <MicIcon />,       variant: 'outline',     title: 'Click to speak' },
  requesting: { icon: <Spinner />,       variant: 'outline',     title: 'Requesting mic...' },
  recording:  { icon: <WaveAnimation />, variant: 'destructive', title: 'Click to stop' },
  processing: { icon: <Spinner />,       variant: 'secondary',   title: 'Processing...' },
  error:      { icon: <MicOffIcon />,    variant: 'destructive', title: 'Error — click to reset' },
}
```

Props: `{ state: RecordingState; onToggle: () => void }`
**Required:** `data-testid="speech-button"`

## WaveAnimation requirements (P4-2)

- 5 CSS-animated bars with staggered `animation-delay`.
- **Zero JavaScript logic** — pure CSS animation.
- Must respect `prefers-reduced-motion`:
  ```css
  @media (prefers-reduced-motion: reduce) { .bar { animation: none; } }
  ```
- **Required:** `data-testid="wave-animation"`

## TranscriptPreview requirements (P4-2 / P4-3)

- Displays `interimText` (italic, muted colour) and `finalText` from context.
- Fades in when text is non-empty; fades out 600ms after final text injected.
- **Required:** `data-testid="transcript-preview"`

## StatusBadge requirements (P4-4)

- Renders `SpeechError` messages using shadcn `Badge` in `destructive` variant.
- Auto-dismisses after **4 seconds** — calls XState `RESET` event on the machine.
- **Required:** `data-testid="error-toast"`
- Test with `jest.useFakeTimers()` and `jest.advanceTimersByTime(4000)`.

## SpeechWidget root (P4-5)

```tsx
export function SpeechWidget(props: SpeechConfig) {
  return (
    <SpeechProvider config={props}>
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2">
        <StatusBadge />
        <TranscriptPreview />
        <SpeechButton />
      </div>
    </SpeechProvider>
  )
}
```

Theme support:
- `theme="light"` → add class `speech-widget-light`
- `theme="dark"` → add class `speech-widget-dark`
- `theme="auto"` → read `window.matchMedia('(prefers-color-scheme: dark)')` and apply accordingly

## data-testid reference — non-negotiable (Playwright E2E depends on these)

| Element | `data-testid` |
|---------|---------------|
| Mic button | `speech-button` |
| Wave animation container | `wave-animation` |
| Transcript preview bubble | `transcript-preview` |
| Error toast | `error-toast` |

All four must exist before P5-2 (Playwright E2E).

## Vite library build (P4-7)

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

**Bundle size gate (NF-02) — fail CI if exceeded:**
```bash
npm run build --workspace=packages/speech-widget
BYTES=$(find packages/speech-widget/dist -name "*.js" | xargs gzip -c | wc -c)
echo "Bundle: ${BYTES} bytes (limit: 51200)"
[ "$BYTES" -lt 51200 ] && echo "✅ OK" || echo "❌ Over 50KB budget"
```

⚠️ XState v5 is ~30KB of the 50KB budget. Do not import XState in `data/` (ADR-04).

## ESLint layer rule verification (P4-6)

1. Add a deliberate violation: import `WsTransport` from `data/` inside any `ui/` file.
2. Run `npm run lint --workspaces --if-present` — verify it reports `no-restricted-imports`.
3. Remove the violation. Verify lint passes.
4. Commit the test: `test(ci): verify ESLint catches ui→data layer violation (ADR-04)`.

## Open questions

- **OQ-04**: Push-to-talk in v1 or v1.1? Default: **defer to v1.1**. Build toggle-to-talk only.

## Done criteria

- [ ] `npm run tsc --workspaces --if-present` — zero errors
- [ ] `npm run lint --workspaces --if-present` — zero violations
- [ ] `npm run test --workspaces --if-present` — all tests pass, all 5 RecordingState variants tested
- [ ] All four `data-testid` attributes present
- [ ] `WaveAnimation` hidden when `prefers-reduced-motion` is set
- [ ] `StatusBadge` disappears after 4s (jest fake timers test)
- [ ] Theme class applied correctly for `light`, `dark`, `auto`
- [ ] Bundle < 51,200 bytes gzipped (NF-02)
- [ ] `DEEPGRAM_API_KEY` not present in built bundle
- [ ] `/audit` passes all frontend-specific checks

## Merge instructions (when done)

```bash
git push origin phase/4-frontend-ui
# In ~/voice-adapter:
git fetch origin
git merge phase/4-frontend-ui --no-ff -m "merge(p4): frontend ui layer"
git worktree remove ~/voice-adapter-frontend-ui
git branch -d phase/4-frontend-ui
```

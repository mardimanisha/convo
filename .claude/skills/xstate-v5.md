# Skill: XState v5 Patterns for recordingMachine

## Critical: v5 API changes from v4

| v4 (DO NOT USE) | v5 (USE THIS) |
|----------------|---------------|
| `interpret(machine)` | `createActor(machine, { input })` |
| `machine.withConfig({ services })` | Pass `actors` to `createActor` options |
| `send('EVENT')` | `actor.send({ type: 'EVENT' })` |
| `state.matches('idle')` | `actor.getSnapshot().matches('idle')` |
| `useMachine(machine, { services })` | `useMachine(machine)` + actor options |

## Machine definition

```typescript
// packages/speech-widget/src/logic/recordingMachine.ts
import { createMachine, assign } from 'xstate'

export const recordingMachine = createMachine({
  id: 'recording',
  initial: 'idle',
  context: {
    sessionId: null as string | null,
    error:     null as string | null,
  },
  states: {
    idle: {
      on: { CLICK: 'requesting' }
    },
    requesting: {
      invoke: {
        // ⚠️ Exact name: 'requestPermission' (not 'requestMic')
        src:     'requestPermission',
        onDone:  { target: 'recording', actions: assign({ sessionId: ({ event }) => event.output }) },
        onError: { target: 'error',     actions: assign({ error: ({ event }) => event.error.message }) }
      }
    },
    recording: {
      on: {
        CLICK:   'processing',
        SILENCE: 'processing',
        ERROR:   { target: 'error', actions: assign({ error: ({ event }) => event.message }) }
      }
    },
    processing: {
      invoke: {
        src:     'finalizeTranscript',
        onDone:  { target: 'idle',  actions: assign({ sessionId: null }) },
        onError: { target: 'error', actions: assign({ error: ({ event }) => event.error.message }) }
      }
    },
    error: {
      on: { RESET: { target: 'idle', actions: assign({ error: null }) } }
    }
  }
})
```

## Actor instantiation (in SpeechProvider)

```typescript
import { createActor, fromPromise } from 'xstate'
import { recordingMachine } from './recordingMachine'

const actor = createActor(recordingMachine, {
  actors: {
    requestPermission: fromPromise(async () => {
      // Calls AudioCapture.start(), returns sessionId string
      await audioCapture.start()
      return sessionId
    }),
    finalizeTranscript: fromPromise(async () => {
      // Calls TranscriptClient.disconnect()
      await transcriptClient.disconnect()
    }),
  }
}).start()
```

## Valid transitions table

```
idle       + CLICK   → requesting
requesting + GRANTED → recording   (context.sessionId populated)
requesting + DENIED  → error       (context.error populated)
recording  + CLICK   → processing
recording  + SILENCE → processing
recording  + ERROR   → error
processing + DONE    → idle        (context.sessionId cleared)
processing + ERROR   → error
error      + RESET   → idle        (context.error cleared)
```

Unknown events leave the state unchanged — never throw.

## Testing with XState v5 (pure, no DOM)

```typescript
import { createActor } from 'xstate'
import { recordingMachine } from '../recordingMachine'

test('idle + CLICK → requesting', () => {
  const actor = createActor(recordingMachine).start()
  expect(actor.getSnapshot().value).toBe('idle')
  actor.send({ type: 'CLICK' })
  expect(actor.getSnapshot().value).toBe('requesting')
})

test('error + RESET → idle, clears error context', () => {
  const actor = createActor(recordingMachine).start()
  // Force into error state
  actor.send({ type: 'CLICK' })
  actor.send({ type: 'DENIED' })
  expect(actor.getSnapshot().value).toBe('error')
  // Reset
  actor.send({ type: 'RESET' })
  expect(actor.getSnapshot().value).toBe('idle')
  expect(actor.getSnapshot().context.error).toBeNull()
})

test('unknown event leaves state unchanged', () => {
  const actor = createActor(recordingMachine).start()
  actor.send({ type: 'UNKNOWN_EVENT' } as any)
  expect(actor.getSnapshot().value).toBe('idle')
})
```

## Forbidden patterns

```typescript
// ❌ DO NOT:
const service = interpret(machine).start()         // v4 API
machine.withConfig({ services: { requestMic } })   // v4 API — also wrong invoke src name
let isRecording = false                             // boolean flag instead of machine state
src: 'requestMic'                                  // wrong name — must be 'requestPermission'

// ✅ DO:
const actor = createActor(machine, {
  actors: { requestPermission: fromPromise(...), finalizeTranscript: fromPromise(...) }
}).start()
actor.getSnapshot().matches('recording')            // state check via machine
```

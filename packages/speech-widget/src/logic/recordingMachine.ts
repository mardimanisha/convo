import { createMachine, assign } from 'xstate'

/**
 * XState v5 recording lifecycle machine (ADR-03).
 * No boolean flags — state is always one of:
 *   idle | requesting | recording | processing | error
 *
 * Invoke src name MUST be 'requestPermission' (used by SpeechProvider actor setup).
 */
export const recordingMachine = createMachine({
  id:      'recording',
  initial: 'idle',
  context: {
    error:     null as string | null,
    sessionId: null as string | null,
  },
  states: {
    idle: {
      on: { CLICK: 'requesting' },
    },

    requesting: {
      invoke: {
        src:    'requestPermission',
        onDone: {
          target:  'recording',
          actions: assign({ sessionId: ({ event }) => event.output as string }),
        },
        onError: {
          target:  'error',
          actions: assign({
            error: ({ event }) => (event.error as Error).message,
          }),
        },
      },
    },

    recording: {
      on: {
        CLICK:   'processing',
        SILENCE: 'processing',
        ERROR: {
          target:  'error',
          actions: assign({
            error: ({ event }) => (event as unknown as { message: string }).message,
          }),
        },
      },
    },

    processing: {
      invoke: {
        src:    'finalizeTranscript',
        onDone: 'idle',
        onError: {
          target:  'error',
          actions: assign({
            error: ({ event }) => (event.error as Error).message,
          }),
        },
      },
    },

    error: {
      on: {
        RESET: {
          target:  'idle',
          actions: assign({ error: null }),
        },
      },
    },
  },
})

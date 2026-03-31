import { createActor, fromPromise } from 'xstate'
import { recordingMachine } from '../logic/recordingMachine'

// ── Helper: wire stub actor implementations via .provide() ────────────────────

function makeActor(opts: {
  requestPermission?: () => Promise<string>
  finalizeTranscript?: () => Promise<void>
} = {}) {
  const machine = recordingMachine.provide({
    actors: {
      requestPermission:  fromPromise(opts.requestPermission  ?? (() => Promise.resolve('sess-test'))),
      finalizeTranscript: fromPromise(opts.finalizeTranscript ?? (() => Promise.resolve())),
    },
  })
  return createActor(machine)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('recordingMachine', () => {
  it('starts in idle', () => {
    const actor = makeActor()
    actor.start()
    expect(actor.getSnapshot().value).toBe('idle')
    actor.stop()
  })

  it('idle + CLICK → requesting', () => {
    const actor = makeActor()
    actor.start()
    actor.send({ type: 'CLICK' })
    expect(actor.getSnapshot().value).toBe('requesting')
    actor.stop()
  })

  it('requesting + resolved promise → recording with sessionId in context', async () => {
    const actor = makeActor({ requestPermission: () => Promise.resolve('sess-abc') })
    actor.start()
    actor.send({ type: 'CLICK' })

    await Promise.resolve()
    await Promise.resolve()

    const snap = actor.getSnapshot()
    expect(snap.value).toBe('recording')
    expect(snap.context.sessionId).toBe('sess-abc')
    actor.stop()
  })

  it('requesting + rejected promise → error with error message in context', async () => {
    const actor = makeActor({
      requestPermission: () => Promise.reject(new Error('mic denied')),
    })
    actor.start()
    actor.send({ type: 'CLICK' })

    await Promise.resolve()
    await Promise.resolve()

    const snap = actor.getSnapshot()
    expect(snap.value).toBe('error')
    expect(snap.context.error).toBe('mic denied')
    actor.stop()
  })

  it('recording + CLICK → processing', async () => {
    let resolveFinalise!: () => void
    const finalizeTranscript = () => new Promise<void>(res => { resolveFinalise = res })

    const actor = makeActor({
      requestPermission: () => Promise.resolve('sess-1'),
      finalizeTranscript,
    })
    actor.start()
    actor.send({ type: 'CLICK' })
    await Promise.resolve(); await Promise.resolve()

    actor.send({ type: 'CLICK' })
    expect(actor.getSnapshot().value).toBe('processing')

    resolveFinalise()
    actor.stop()
  })

  it('recording + SILENCE → processing', async () => {
    let resolveFinalise!: () => void
    const finalizeTranscript = () => new Promise<void>(res => { resolveFinalise = res })

    const actor = makeActor({
      requestPermission: () => Promise.resolve('sess-2'),
      finalizeTranscript,
    })
    actor.start()
    actor.send({ type: 'CLICK' })
    await Promise.resolve(); await Promise.resolve()

    actor.send({ type: 'SILENCE' })
    expect(actor.getSnapshot().value).toBe('processing')

    resolveFinalise()
    actor.stop()
  })

  it('processing + resolved promise → idle', async () => {
    const actor = makeActor({
      requestPermission:  () => Promise.resolve('sess-3'),
      finalizeTranscript: () => Promise.resolve(),
    })
    actor.start()
    actor.send({ type: 'CLICK' })
    await Promise.resolve(); await Promise.resolve()

    actor.send({ type: 'CLICK' })
    await Promise.resolve(); await Promise.resolve()

    expect(actor.getSnapshot().value).toBe('idle')
    actor.stop()
  })

  it('error + RESET → idle with cleared error context', async () => {
    const actor = makeActor({
      requestPermission: () => Promise.reject(new Error('denied')),
    })
    actor.start()
    actor.send({ type: 'CLICK' })
    await Promise.resolve(); await Promise.resolve()

    expect(actor.getSnapshot().value).toBe('error')

    actor.send({ type: 'RESET' })
    const snap = actor.getSnapshot()
    expect(snap.value).toBe('idle')
    expect(snap.context.error).toBeNull()
    actor.stop()
  })

  it('unknown events leave state unchanged', () => {
    const actor = makeActor()
    actor.start()
    actor.send({ type: 'UNKNOWN_EVENT' } as never)
    expect(actor.getSnapshot().value).toBe('idle')
    actor.stop()
  })
})

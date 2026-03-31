import { render, screen, act } from '@testing-library/react'
import { EventEmitter } from 'events'
import { useTranscript } from '../logic/useTranscript'
import type { ITranscriptClient, TranscriptEvent } from '../data/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockClient(): ITranscriptClient & EventEmitter {
  const emitter = new EventEmitter() as ITranscriptClient & EventEmitter
  emitter.connect    = jest.fn()
  emitter.disconnect = jest.fn()
  emitter.sendChunk  = jest.fn()
  return emitter
}

// Test component that renders the hook state
function TestComp({ client, selector }: { client: ITranscriptClient; selector: string }) {
  const { interimText, finalText } = useTranscript(client, selector)
  return (
    <>
      <span data-testid="interim">{interimText}</span>
      <span data-testid="final">{finalText}</span>
    </>
  )
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Create a textarea the injectTranscript call can target
  const ta = document.createElement('textarea')
  ta.id = 'agent-input'
  document.body.appendChild(ta)
})

afterEach(() => {
  const ta = document.getElementById('agent-input')
  if (ta) document.body.removeChild(ta)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useTranscript', () => {
  it('updates interimText on interim transcript events', () => {
    const client = makeMockClient()
    render(<TestComp client={client} selector="#agent-input" />)

    act(() => {
      const event: TranscriptEvent = { type: 'interim', text: 'hell', sessionId: 's1' }
      client.emit('transcript', event)
    })

    expect(screen.getByTestId('interim').textContent).toBe('hell')
    expect(screen.getByTestId('final').textContent).toBe('')
  })

  it('updates finalText and clears interimText on final events', () => {
    const client = makeMockClient()
    render(<TestComp client={client} selector="#agent-input" />)

    act(() => {
      client.emit('transcript', { type: 'interim', text: 'hell', sessionId: 's2' })
    })
    act(() => {
      client.emit('transcript', { type: 'final', text: 'hello world', sessionId: 's2' })
    })

    expect(screen.getByTestId('final').textContent).toBe('hello world')
    expect(screen.getByTestId('interim').textContent).toBe('')
  })

  it('calls injectTranscript on final event (textarea value is set)', () => {
    const client = makeMockClient()
    render(<TestComp client={client} selector="#agent-input" />)

    act(() => {
      client.emit('transcript', { type: 'final', text: 'injected!', sessionId: 's3' })
    })

    const ta = document.getElementById('agent-input') as HTMLTextAreaElement
    expect(ta.value).toBe('injected!')
  })

  it('cleans up event listeners on unmount', () => {
    const client      = makeMockClient()
    const removeSpy   = jest.spyOn(client, 'removeAllListeners')
    const { unmount } = render(<TestComp client={client} selector="#agent-input" />)

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('transcript')
  })
})

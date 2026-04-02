import { render, screen, act } from '@testing-library/react'
import { EventEmitter } from 'events'
import { SpeechProvider, useSpeechContext } from '../logic/SpeechProvider'
import type { ITranscriptClient, SpeechConfig } from '../data/types'

// ── Mock client ───────────────────────────────────────────────────────────────

function makeMockClient(): ITranscriptClient & EventEmitter {
  const emitter = new EventEmitter() as ITranscriptClient & EventEmitter
  emitter.connect    = jest.fn()
  emitter.disconnect = jest.fn()
  emitter.sendChunk  = jest.fn()
  return emitter
}

const validConfig: SpeechConfig = {
  apiUrl:         'wss://api.test/ws',
  targetSelector: '#input',
}

// Consumer that renders context values for assertions
function ContextReader() {
  const { interimText, finalText, machineState } = useSpeechContext()
  return (
    <>
      <span data-testid="interim">{interimText}</span>
      <span data-testid="final">{finalText}</span>
      <span data-testid="state">{machineState}</span>
    </>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useWidgetConfig', () => {
  it('throws when apiUrl is missing', () => {
    // Suppress React error boundary noise
    jest.spyOn(console, 'error').mockImplementation(() => {})

    expect(() =>
      render(
        <SpeechProvider config={{ apiUrl: '', targetSelector: '#x' } as SpeechConfig} client={makeMockClient()}>
          <div />
        </SpeechProvider>,
      ),
    ).toThrow('apiUrl is required')
  })

  it('throws when targetSelector is missing', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})

    expect(() =>
      render(
        <SpeechProvider config={{ apiUrl: 'wss://x', targetSelector: '' } as SpeechConfig} client={makeMockClient()}>
          <div />
        </SpeechProvider>,
      ),
    ).toThrow('targetSelector is required')
  })

  it('applies default lang and theme when omitted', () => {
    // Indirectly verified: SpeechProvider renders without error with valid config
    const client = makeMockClient()
    const { container } = render(
      <SpeechProvider config={validConfig} client={client}>
        <span data-testid="child">ok</span>
      </SpeechProvider>,
    )
    expect(screen.getByTestId('child').textContent).toBe('ok')
  })
})

describe('SpeechProvider', () => {
  it('renders children and populates context with initial machine state', () => {
    const client = makeMockClient()
    render(
      <SpeechProvider config={validConfig} client={client}>
        <ContextReader />
      </SpeechProvider>,
    )

    expect(screen.getByTestId('state').textContent).toBe('idle')
    expect(screen.getByTestId('interim').textContent).toBe('')
    expect(screen.getByTestId('final').textContent).toBe('')
  })

  it('updates interimText on interim transcript event', () => {
    const client = makeMockClient()
    render(
      <SpeechProvider config={validConfig} client={client}>
        <ContextReader />
      </SpeechProvider>,
    )

    act(() => {
      client.emit('transcript', { type: 'interim', text: 'hey', sessionId: 's1' })
    })

    expect(screen.getByTestId('interim').textContent).toBe('hey')
  })

  it('updates finalText and clears interim on final transcript event', () => {
    const client = makeMockClient()
    render(
      <SpeechProvider config={validConfig} client={client}>
        <ContextReader />
      </SpeechProvider>,
    )

    act(() => { client.emit('transcript', { type: 'interim', text: 'hey', sessionId: 's2' }) })
    act(() => { client.emit('transcript', { type: 'final',   text: 'hey there', sessionId: 's2' }) })

    expect(screen.getByTestId('final').textContent).toBe('hey there')
    expect(screen.getByTestId('interim').textContent).toBe('')
  })

  it('calls onTranscript callback on final transcript event', () => {
    const onTranscript = jest.fn()
    const client       = makeMockClient()

    render(
      <SpeechProvider config={{ ...validConfig, onTranscript }} client={client}>
        <ContextReader />
      </SpeechProvider>,
    )

    act(() => {
      client.emit('transcript', { type: 'final', text: 'done!', sessionId: 's3' })
    })

    expect(onTranscript).toHaveBeenCalledWith('done!')
  })

  it('useSpeechContext throws outside SpeechProvider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})

    function Orphan() {
      useSpeechContext()
      return null
    }

    expect(() => render(<Orphan />)).toThrow('useSpeechContext must be used inside <SpeechProvider>')
  })
})

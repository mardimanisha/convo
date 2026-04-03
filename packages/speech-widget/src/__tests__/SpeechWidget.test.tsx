import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { SpeechWidget } from '../ui/SpeechWidget'

// ── Module-level store so factory functions can reference it ──────────────────

const mockCtx = {
  client:       {} as never,
  interimText:  '',
  finalText:    '',
  machineState: 'idle',
  machineError: null as string | null,
  send:         jest.fn(),
}

jest.mock('../logic/SpeechProvider', () => ({
  SpeechProvider: ({ children }: { children: React.ReactNode }) => children,
  useSpeechContext: () => mockCtx,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function setCtx(overrides: Partial<typeof mockCtx>) {
  Object.assign(mockCtx, {
    client:       {} as never,
    interimText:  '',
    finalText:    '',
    machineState: 'idle',
    machineError: null,
    send:         jest.fn(),
    ...overrides,
  })
}

function renderWidget(config: Partial<React.ComponentProps<typeof SpeechWidget>> = {}) {
  return render(
    <SpeechWidget
      apiUrl="wss://example.com/ws"
      targetSelector="#input"
      {...config}
    />
  )
}

function mockMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
      media:   query,
      addEventListener:    jest.fn(),
      removeEventListener: jest.fn(),
    })),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SpeechWidget', () => {
  beforeAll(() => mockMatchMedia(false))
  beforeEach(() => setCtx({}))

  it('renders the fixed floating container', () => {
    renderWidget()
    expect(document.querySelector('.fixed')).toBeInTheDocument()
  })

  it('applies speech-widget-light class when theme="light"', () => {
    renderWidget({ theme: 'light' })
    expect(document.querySelector('.speech-widget-light')).toBeInTheDocument()
  })

  it('applies speech-widget-dark class when theme="dark"', () => {
    renderWidget({ theme: 'dark' })
    expect(document.querySelector('.speech-widget-dark')).toBeInTheDocument()
  })

  it('applies speech-widget-dark when theme="auto" and system prefers dark', () => {
    mockMatchMedia(true)
    renderWidget({ theme: 'auto' })
    expect(document.querySelector('.speech-widget-dark')).toBeInTheDocument()
  })

  it('applies speech-widget-light when theme="auto" and system prefers light', () => {
    mockMatchMedia(false)
    renderWidget({ theme: 'auto' })
    expect(document.querySelector('.speech-widget-light')).toBeInTheDocument()
  })

  it('renders data-testid="speech-button"', () => {
    renderWidget()
    expect(screen.getByTestId('speech-button')).toBeInTheDocument()
  })

  it('renders data-testid="transcript-preview" when interimText is set', () => {
    setCtx({ interimText: 'hello' })
    renderWidget()
    expect(screen.getByTestId('transcript-preview')).toBeInTheDocument()
  })

  it('renders data-testid="error-toast" when machineState is "error"', () => {
    setCtx({ machineState: 'error', machineError: 'mic denied' })
    renderWidget()
    expect(screen.getByTestId('error-toast')).toBeInTheDocument()
  })

  it('renders data-testid="wave-animation" when machineState is "recording"', () => {
    setCtx({ machineState: 'recording' })
    renderWidget()
    expect(screen.getByTestId('wave-animation')).toBeInTheDocument()
  })
})

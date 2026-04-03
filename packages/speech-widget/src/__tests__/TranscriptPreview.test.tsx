import * as React from 'react'
import { render, screen, act } from '@testing-library/react'
import { TranscriptPreview } from '../ui/TranscriptPreview'

// Minimal context stub — avoids spinning up XState / TranscriptClient
jest.mock('../logic/SpeechProvider', () => ({
  useSpeechContext: jest.fn(),
}))

import { useSpeechContext } from '../logic/SpeechProvider'

const mockContext = useSpeechContext as jest.MockedFunction<typeof useSpeechContext>

function makeCtx(overrides: Partial<ReturnType<typeof useSpeechContext>> = {}): ReturnType<typeof useSpeechContext> {
  return {
    client:       {} as never,
    interimText:  '',
    finalText:    '',
    machineState: 'idle',
    machineError: null,
    send:         jest.fn(),
    ...overrides,
  }
}

describe('TranscriptPreview', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    act(() => { jest.runOnlyPendingTimers() })
    jest.useRealTimers()
  })

  it('renders nothing when both texts are empty', () => {
    mockContext.mockReturnValue(makeCtx())
    const { container } = render(<TranscriptPreview />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders data-testid="transcript-preview" when interimText is set', () => {
    mockContext.mockReturnValue(makeCtx({ interimText: 'hello wor' }))
    render(<TranscriptPreview />)
    expect(screen.getByTestId('transcript-preview')).toBeInTheDocument()
  })

  it('renders interim text in italic/muted element', () => {
    mockContext.mockReturnValue(makeCtx({ interimText: 'hello wor' }))
    render(<TranscriptPreview />)
    const el = screen.getByText('hello wor')
    expect(el.tagName).toBe('P')
    expect(el.className).toContain('italic')
  })

  it('renders final text when finalText is set', () => {
    mockContext.mockReturnValue(makeCtx({ finalText: 'hello world' }))
    render(<TranscriptPreview />)
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('applies fade-out class 600ms after finalText is set', () => {
    mockContext.mockReturnValue(makeCtx({ finalText: 'hello world' }))
    render(<TranscriptPreview />)
    const el = screen.getByTestId('transcript-preview')
    expect(el.className).toContain('opacity-100')

    act(() => { jest.advanceTimersByTime(600) })
    expect(el.className).toContain('opacity-0')
  })

  it('does not fade out while only interimText is present', () => {
    mockContext.mockReturnValue(makeCtx({ interimText: 'typing...' }))
    render(<TranscriptPreview />)
    act(() => { jest.advanceTimersByTime(1000) })
    const el = screen.getByTestId('transcript-preview')
    expect(el.className).toContain('opacity-100')
  })
})

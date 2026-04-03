import * as React from 'react'
import { render, screen, act } from '@testing-library/react'
import { StatusBadge } from '../ui/StatusBadge'

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

describe('StatusBadge', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    act(() => { jest.runOnlyPendingTimers() })
    jest.useRealTimers()
  })

  it('renders nothing when machineState is not "error"', () => {
    const states = ['idle', 'requesting', 'recording', 'processing'] as const
    states.forEach((state) => {
      mockContext.mockReturnValue(makeCtx({ machineState: state }))
      const { container, unmount } = render(<StatusBadge />)
      expect(container).toBeEmptyDOMElement()
      unmount()
    })
  })

  it('renders data-testid="error-toast" when machineState is "error"', () => {
    mockContext.mockReturnValue(makeCtx({ machineState: 'error', machineError: 'mic denied' }))
    render(<StatusBadge />)
    expect(screen.getByTestId('error-toast')).toBeInTheDocument()
  })

  it('displays the machineError message', () => {
    mockContext.mockReturnValue(makeCtx({ machineState: 'error', machineError: 'PERMISSION_DENIED' }))
    render(<StatusBadge />)
    expect(screen.getByTestId('error-toast')).toHaveTextContent('PERMISSION_DENIED')
  })

  it('falls back to default message when machineError is null', () => {
    mockContext.mockReturnValue(makeCtx({ machineState: 'error', machineError: null }))
    render(<StatusBadge />)
    expect(screen.getByTestId('error-toast')).toHaveTextContent('An error occurred')
  })

  it('calls send({ type: "RESET" }) after 4 seconds', () => {
    const send = jest.fn()
    mockContext.mockReturnValue(makeCtx({ machineState: 'error', machineError: 'oops', send }))
    render(<StatusBadge />)
    expect(send).not.toHaveBeenCalled()
    act(() => { jest.advanceTimersByTime(4000) })
    expect(send).toHaveBeenCalledWith({ type: 'RESET' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('clears the timer on unmount (no state update after unmount)', () => {
    const send = jest.fn()
    mockContext.mockReturnValue(makeCtx({ machineState: 'error', machineError: 'oops', send }))
    const { unmount } = render(<StatusBadge />)
    unmount()
    act(() => { jest.advanceTimersByTime(4000) })
    expect(send).not.toHaveBeenCalled()
  })
})

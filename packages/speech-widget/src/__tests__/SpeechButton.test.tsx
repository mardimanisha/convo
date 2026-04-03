import * as React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SpeechButton } from '../ui/SpeechButton'
import type { RecordingState } from '../data/types'

const states: RecordingState[] = ['idle', 'requesting', 'recording', 'processing', 'error']

const expectedTitles: Record<RecordingState, string> = {
  idle:       'Click to speak',
  requesting: 'Requesting mic...',
  recording:  'Click to stop',
  processing: 'Processing...',
  error:      'Error — click to reset',
}

describe('SpeechButton', () => {
  it.each(states)('renders data-testid="speech-button" for state "%s"', (state) => {
    const { unmount } = render(<SpeechButton state={state} onToggle={() => {}} />)
    expect(screen.getByTestId('speech-button')).toBeInTheDocument()
    unmount()
  })

  it.each(states)('renders correct title for state "%s"', (state) => {
    const { unmount } = render(<SpeechButton state={state} onToggle={() => {}} />)
    expect(screen.getByTestId('speech-button')).toHaveAttribute('title', expectedTitles[state])
    unmount()
  })

  it('calls onToggle when clicked', async () => {
    const onToggle = jest.fn()
    render(<SpeechButton state="idle" onToggle={onToggle} />)
    await userEvent.click(screen.getByTestId('speech-button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('renders WaveAnimation when state is "recording"', () => {
    render(<SpeechButton state="recording" onToggle={() => {}} />)
    expect(screen.getByTestId('wave-animation')).toBeInTheDocument()
  })

  it.each(['idle', 'requesting', 'processing', 'error'] as RecordingState[])(
    'does not render WaveAnimation for state "%s"',
    (state) => {
      const { unmount } = render(<SpeechButton state={state} onToggle={() => {}} />)
      expect(screen.queryByTestId('wave-animation')).not.toBeInTheDocument()
      unmount()
    }
  )
})

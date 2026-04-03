import * as React from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WaveAnimation } from './WaveAnimation'
import type { RecordingState } from '../logic/types'

interface ButtonConfig {
  icon:    React.ReactNode
  variant: 'outline' | 'destructive' | 'secondary'
  title:   string
}

const stateConfig: Record<RecordingState, ButtonConfig> = {
  idle:       { icon: <Mic />,                                variant: 'outline',     title: 'Click to speak' },
  requesting: { icon: <Loader2 className="animate-spin" />,   variant: 'outline',     title: 'Requesting mic...' },
  recording:  { icon: <WaveAnimation />,                      variant: 'destructive', title: 'Click to stop' },
  processing: { icon: <Loader2 className="animate-spin" />,   variant: 'secondary',   title: 'Processing...' },
  error:      { icon: <MicOff />,                             variant: 'destructive', title: 'Error — click to reset' },
}

export interface SpeechButtonProps {
  state:    RecordingState
  onToggle: () => void
}

export function SpeechButton({ state, onToggle }: SpeechButtonProps) {
  const { icon, variant, title } = stateConfig[state]
  return (
    <Button
      data-testid="speech-button"
      variant={variant}
      size="icon"
      title={title}
      aria-label={title}
      onClick={onToggle}
    >
      {icon}
    </Button>
  )
}

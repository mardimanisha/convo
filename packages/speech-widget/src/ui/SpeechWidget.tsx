import * as React from 'react'
import { SpeechProvider, useSpeechContext } from '../logic/SpeechProvider'
import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { TranscriptPreview } from './TranscriptPreview'
import { SpeechButton } from './SpeechButton'
import type { SpeechConfig, RecordingState } from '../logic/types'

function resolveTheme(theme: SpeechConfig['theme']): string {
  if (theme === 'light') return 'speech-widget-light'
  if (theme === 'dark')  return 'speech-widget-dark'
  // auto
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'speech-widget-dark' : 'speech-widget-light'
}

function WidgetInner() {
  const { machineState, send } = useSpeechContext()

  const onToggle = () => {
    if (machineState === 'error') {
      send({ type: 'RESET' })
    } else {
      send({ type: 'CLICK' })
    }
  }

  return (
    <>
      <StatusBadge />
      <TranscriptPreview />
      <SpeechButton state={machineState as RecordingState} onToggle={onToggle} />
    </>
  )
}

export function SpeechWidget(props: SpeechConfig) {
  const themeClass = resolveTheme(props.theme ?? 'auto')
  return (
    <SpeechProvider config={props}>
      <div className={cn('fixed bottom-6 right-6 flex flex-col items-end gap-2', themeClass)}>
        <WidgetInner />
      </div>
    </SpeechProvider>
  )
}

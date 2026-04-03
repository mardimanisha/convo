import * as React from 'react'
import { useSpeechContext } from '../logic/SpeechProvider'
import { cn } from '@/lib/utils'

export function TranscriptPreview() {
  const { interimText, finalText } = useSpeechContext()

  const [visible,   setVisible]   = React.useState(false)
  const [fadingOut, setFadingOut] = React.useState(false)

  // Show when either text is non-empty; fade out 600ms after finalText arrives
  React.useEffect(() => {
    if (finalText) {
      setVisible(true)
      setFadingOut(false)
      const timer = setTimeout(() => setFadingOut(true), 600)
      return () => clearTimeout(timer)
    }
    if (interimText) {
      setVisible(true)
      setFadingOut(false)
    } else {
      setVisible(false)
      setFadingOut(false)
    }
  }, [interimText, finalText])

  if (!visible && !interimText && !finalText) return null

  return (
    <div
      data-testid="transcript-preview"
      className={cn(
        'max-w-xs rounded-lg border bg-background px-3 py-2 text-sm shadow-md transition-opacity duration-300',
        fadingOut ? 'opacity-0' : 'opacity-100',
      )}
    >
      {interimText && (
        <p className="italic text-muted-foreground">{interimText}</p>
      )}
      {finalText && (
        <p className="text-foreground">{finalText}</p>
      )}
    </div>
  )
}

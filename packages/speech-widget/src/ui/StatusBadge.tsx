import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { useSpeechContext } from '../logic/SpeechProvider'

export function StatusBadge() {
  const { machineState, machineError, send } = useSpeechContext()

  React.useEffect(() => {
    if (machineState !== 'error') return
    const timer = setTimeout(() => send({ type: 'RESET' }), 4000)
    return () => clearTimeout(timer)
  }, [machineState, send])

  if (machineState !== 'error') return null

  return (
    <Badge
      data-testid="error-toast"
      variant="destructive"
    >
      {machineError ?? 'An error occurred'}
    </Badge>
  )
}

// Types
export type {
  SpeechConfig,
  RecordingState,
  TranscriptEvent,
  SpeechErrorCode,
  ITranscriptClient,
  ClientControlMessage,
  ServerMessage,
} from './data/types'
export { SpeechError } from './data/types'

// UI components
export { SpeechWidget }      from './ui/SpeechWidget'
export { SpeechButton }      from './ui/SpeechButton'
export { WaveAnimation }     from './ui/WaveAnimation'
export { TranscriptPreview } from './ui/TranscriptPreview'
export { StatusBadge }       from './ui/StatusBadge'

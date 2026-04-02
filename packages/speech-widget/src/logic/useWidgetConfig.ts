import type { SpeechConfig } from '../data/types'

type ResolvedConfig = Required<Pick<SpeechConfig, 'apiUrl' | 'targetSelector' | 'lang' | 'theme'>> & {
  onTranscript?: (text: string) => void
  onError?:      (error: import('../data/types').SpeechError) => void
}

/**
 * Merges user-supplied SpeechConfig with defaults and validates required fields.
 * Throws if apiUrl or targetSelector are missing.
 * Returns a frozen config so callers cannot mutate shared state.
 */
export function useWidgetConfig(config: SpeechConfig): Readonly<ResolvedConfig> {
  if (!config.apiUrl) {
    throw new Error('SpeechWidget: apiUrl is required')
  }
  if (!config.targetSelector) {
    throw new Error('SpeechWidget: targetSelector is required')
  }

  return Object.freeze({
    apiUrl:         config.apiUrl,
    targetSelector: config.targetSelector,
    lang:           config.lang  ?? 'en-US',
    theme:          config.theme ?? 'auto',
    ...(config.onTranscript !== undefined ? { onTranscript: config.onTranscript } : {}),
    ...(config.onError      !== undefined ? { onError:      config.onError      } : {}),
  })
}

import { SpeechError } from '../data/types'

/**
 * Injects text into a DOM input/textarea element identified by CSS selector.
 *
 * Uses the native HTMLTextAreaElement prototype setter to bypass React's
 * instance-level .value override — setting .value directly is silently
 * ignored by React's reconciler (see CLAUDE.md §15 note 1).
 *
 * Fires input, change, and speech:done events so React's synthetic event
 * system picks up the change and host-app listeners can react.
 */
export function injectTranscript(selector: string, text: string): void {
  const el = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(selector)
  if (!el) {
    throw new SpeechError('TARGET_NOT_FOUND', `No element matches "${selector}"`)
  }

  const proto = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype

  const nativeValueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  nativeValueSetter?.call(el, text)

  el.dispatchEvent(new Event('input',  { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.dispatchEvent(new CustomEvent('speech:done', { detail: { text }, bubbles: true }))
}

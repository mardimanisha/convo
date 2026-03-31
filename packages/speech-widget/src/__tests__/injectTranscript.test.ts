import { injectTranscript } from '../logic/injectTranscript'
import { SpeechError } from '../data/types'

describe('injectTranscript', () => {
  let textarea: HTMLTextAreaElement

  beforeEach(() => {
    textarea = document.createElement('textarea')
    textarea.id = 'target'
    document.body.appendChild(textarea)
  })

  afterEach(() => {
    document.body.removeChild(textarea)
  })

  it('sets the value on a matching textarea', () => {
    injectTranscript('#target', 'hello world')
    expect(textarea.value).toBe('hello world')
  })

  it('fires a bubbling input event', () => {
    const handler = jest.fn()
    document.body.addEventListener('input', handler)
    injectTranscript('#target', 'test')
    expect(handler).toHaveBeenCalledTimes(1)
    document.body.removeEventListener('input', handler)
  })

  it('fires a bubbling change event', () => {
    const handler = jest.fn()
    document.body.addEventListener('change', handler)
    injectTranscript('#target', 'test')
    expect(handler).toHaveBeenCalledTimes(1)
    document.body.removeEventListener('change', handler)
  })

  it('fires a bubbling speech:done CustomEvent with detail.text', () => {
    let detail: unknown
    document.body.addEventListener('speech:done', (e) => {
      detail = (e as CustomEvent).detail
    })
    injectTranscript('#target', 'final text')
    expect(detail).toEqual({ text: 'final text' })
  })

  it('throws SpeechError TARGET_NOT_FOUND when selector matches nothing', () => {
    expect(() => injectTranscript('#does-not-exist', 'x')).toThrow(SpeechError)
    try {
      injectTranscript('#does-not-exist', 'x')
    } catch (e) {
      expect((e as SpeechError).code).toBe('TARGET_NOT_FOUND')
    }
  })

  it('also works with an input[type=text] element', () => {
    const input = document.createElement('input')
    input.type = 'text'
    input.id   = 'text-input'
    document.body.appendChild(input)

    injectTranscript('#text-input', 'typed text')
    expect(input.value).toBe('typed text')

    document.body.removeChild(input)
  })
})

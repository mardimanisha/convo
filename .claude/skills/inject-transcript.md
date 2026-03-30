# Skill: injectTranscript — React Native Setter

## The Problem

React controlled inputs override the `.value` property on the element **instance**.
Setting `element.value = text` directly is silently ignored by React's reconciler —
React re-renders and overwrites it with its own state value.

## The Solution

Use the **native prototype setter** on `HTMLTextAreaElement.prototype` or `HTMLInputElement.prototype`.
This bypasses the instance-level override and correctly triggers React's synthetic `onChange`.

## Canonical Implementation

```typescript
// packages/speech-widget/src/logic/injectTranscript.ts
import { SpeechError } from '../data/types'

export function injectTranscript(selector: string, text: string): void {
  const el = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(selector)
  if (!el) {
    throw new SpeechError('TARGET_NOT_FOUND', `No element matches "${selector}"`)
  }

  // React overrides .value on the element INSTANCE — use the native prototype setter
  // to bypass React's override and correctly trigger React's synthetic onChange.
  // (See CLAUDE.md §15, note 1)
  const nativeValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set
  nativeValueSetter?.call(el, text)

  // Dispatch events so React synthetic onChange fires and Vue/Angular also pick up the change.
  el.dispatchEvent(new Event('input',  { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))

  // Custom event for agent-side listeners.
  el.dispatchEvent(new CustomEvent('speech:done', { detail: { text }, bubbles: true }))
}
```

## jsdom Tests

```typescript
// src/__tests__/logic/injectTranscript.test.ts
import { injectTranscript } from '../logic/injectTranscript'
import { SpeechError } from '../data/types'

beforeEach(() => {
  document.body.innerHTML = '<textarea id="input"></textarea>'
})

afterEach(() => {
  document.body.innerHTML = ''
})

test('sets value on textarea', () => {
  injectTranscript('#input', 'hello world')
  expect((document.getElementById('input') as HTMLTextAreaElement).value).toBe('hello world')
})

test('fires input event with bubbles', () => {
  const handler = jest.fn()
  document.getElementById('input')!.addEventListener('input', handler)
  injectTranscript('#input', 'test')
  expect(handler).toHaveBeenCalledTimes(1)
  expect((handler.mock.calls[0][0] as Event).bubbles).toBe(true)
})

test('fires change event with bubbles', () => {
  const handler = jest.fn()
  document.getElementById('input')!.addEventListener('change', handler)
  injectTranscript('#input', 'test')
  expect(handler).toHaveBeenCalledTimes(1)
})

test('fires speech:done CustomEvent with correct detail', () => {
  const handler = jest.fn()
  document.getElementById('input')!.addEventListener('speech:done', handler)
  injectTranscript('#input', 'final text')
  expect(handler).toHaveBeenCalledTimes(1)
  expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ text: 'final text' })
})

test('throws SpeechError with TARGET_NOT_FOUND for missing selector', () => {
  expect(() => injectTranscript('#nonexistent', 'text')).toThrow(SpeechError)
  try {
    injectTranscript('#nonexistent', 'text')
  } catch (e) {
    expect((e as SpeechError).code).toBe('TARGET_NOT_FOUND')
  }
})
```

## Why three events?

| Event | Framework that needs it |
|-------|------------------------|
| `input` | Vue, Angular, vanilla JS event listeners |
| `change` | React synthetic onChange, HTML form validation |
| `speech:done` | Agent-side listeners that want to know when injection happened |

All three must be dispatched. Dispatching only `change` will miss Vue. Dispatching only `input` may miss some React versions.

## Common Mistakes

| ❌ Wrong | ✅ Right |
|---------|---------|
| `el.value = text` | `nativeValueSetter?.call(el, text)` |
| Only dispatching `change` | Dispatch `input`, `change`, AND `speech:done` |
| Not dispatching `speech:done` | Agent-side listeners depend on this custom event |
| Not checking `el` for null | Always throw `SpeechError('TARGET_NOT_FOUND', ...)` |
| Using `HTMLInputElement.prototype` for textarea | Use `HTMLTextAreaElement.prototype` — different prototype chain |

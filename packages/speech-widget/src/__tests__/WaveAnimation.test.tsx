import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { WaveAnimation } from '../ui/WaveAnimation'

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media:   query,
      addEventListener:    jest.fn(),
      removeEventListener: jest.fn(),
    })),
  })
}

describe('WaveAnimation', () => {
  it('renders the wave container with data-testid', () => {
    render(<WaveAnimation />)
    expect(screen.getByTestId('wave-animation')).toBeInTheDocument()
  })

  it('renders exactly 5 bars', () => {
    render(<WaveAnimation />)
    const container = screen.getByTestId('wave-animation')
    expect(container.querySelectorAll('.sw-bar')).toHaveLength(5)
  })

  it('applies staggered animation-delay to each bar', () => {
    render(<WaveAnimation />)
    const bars = Array.from(
      screen.getByTestId('wave-animation').querySelectorAll('.sw-bar')
    )
    const delays = bars.map((b) => (b as HTMLElement).style.animationDelay)
    expect(delays).toEqual(['0ms', '150ms', '300ms', '450ms', '600ms'])
  })

  it('injects a <style> tag containing the sw-wave keyframe', () => {
    render(<WaveAnimation />)
    const styles = Array.from(document.querySelectorAll('style'))
    const hasKeyframe = styles.some((s) => s.textContent?.includes('sw-wave'))
    expect(hasKeyframe).toBe(true)
  })

  it('includes prefers-reduced-motion rule in the injected style', () => {
    render(<WaveAnimation />)
    const styles = Array.from(document.querySelectorAll('style'))
    const hasRule = styles.some((s) =>
      s.textContent?.includes('prefers-reduced-motion')
    )
    expect(hasRule).toBe(true)
  })

  it('is marked aria-hidden', () => {
    render(<WaveAnimation />)
    expect(screen.getByTestId('wave-animation')).toHaveAttribute('aria-hidden', 'true')
  })
})

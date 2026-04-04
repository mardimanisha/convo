import * as React from 'react'

const STYLE = `
  @keyframes sw-wave {
    0%, 100% { transform: scaleY(0.4); }
    50%       { transform: scaleY(1.0); }
  }
  .sw-bar {
    animation: sw-wave 1s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .sw-bar { animation: none; }
  }
`

const DELAYS = ['0ms', '150ms', '300ms', '450ms', '600ms']

export function WaveAnimation() {
  return (
    <>
      <style>{STYLE}</style>
      <div
        data-testid="wave-animation"
        role="presentation"
        className="flex items-center gap-0.5 h-4"
      >
        {DELAYS.map((delay, i) => (
          <span
            key={i}
            className="sw-bar inline-block w-0.5 h-full bg-current rounded-sm origin-center"
            style={{ animationDelay: delay }}
          />
        ))}
      </div>
    </>
  )
}

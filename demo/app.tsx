import React from 'react'
import ReactDOM from 'react-dom/client'
import { SpeechWidget } from '@convo/speech-widget'

// Allow override via .env (VITE_API_URL) for staging/prod; default to local dev
const WS_URL = (import.meta as Record<string, unknown> & { env: Record<string, string> }).env.VITE_API_URL
  ?? 'ws://localhost:3000/ws'

function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>SpeechWidget Demo</h1>
      <p>Click the microphone button (bottom-right) to start recording.</p>
      <label htmlFor="agent-input" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
        Agent input field
      </label>
      <textarea
        id="agent-input"
        placeholder="Type or speak — transcript will be injected here"
        rows={6}
        style={{ width: '100%', fontSize: '1rem', padding: '0.5rem', boxSizing: 'border-box' }}
      />
      <SpeechWidget
        apiUrl={WS_URL}
        targetSelector="#agent-input"
        lang="en-US"
        theme="auto"
        onTranscript={(text) => console.log('[demo] transcript:', text)}
        onError={(err) => console.error('[demo] error:', err.code, err.message)}
      />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

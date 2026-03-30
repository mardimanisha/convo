# voice-adapter

A drop-in npm package (`SpeechWidget`) that adds voice-to-text to any agent UI. The widget floats over the host page, records audio, streams it through a Node.js relay to Deepgram, and injects the final transcript into any CSS-selected input field.

## Packages

- **`packages/speech-widget`** — React widget (frontend npm package)
- **`apps/api`** — Node.js relay backend (WebSocket gateway to Deepgram)

## Quick Start

```bash
# Install dependencies
npm install

# Start Redis (required by the API)
docker-compose up redis

# Start the API in dev mode
npm run dev:api
```

## Usage

```tsx
import { SpeechWidget } from '@convo/speech-widget'

function AgentInterface() {
  return (
    <div>
      <textarea id="agent-input" placeholder="Type or speak..." />
      <SpeechWidget
        apiUrl={import.meta.env.VITE_API_URL}
        targetSelector="#agent-input"
        lang="en-US"
        theme="auto"
        onTranscript={(text) => console.log('Transcribed:', text)}
        onError={(err) => console.error(err.code, err.message)}
      />
    </div>
  )
}
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build all packages |
| `npm run test` | Run all tests |
| `npm run lint` | Lint all packages |
| `npm run dev:api` | Start API in watch mode |

## Architecture

```
User clicks mic → recording starts, waveform animates
               → interim transcripts appear in preview bubble
User clicks again → stream closes → Deepgram returns final transcript
                 → text injected into agent input field
```

See [CLAUDE.md](CLAUDE.md) for full architecture documentation and build guide.

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
DEEPGRAM_API_KEY=your_deepgram_key
REDIS_URL=redis://localhost:6379
PORT=3000
```

import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// This config serves the demo page during Playwright E2E tests and local dev.
// It imports speech-widget directly from TypeScript source (no build step needed).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Import widget source directly — avoids a build step before running Playwright
      '@convo/speech-widget': path.resolve(__dirname, '../packages/speech-widget/src/index.ts'),
      // Required: speech-widget source uses '@/lib/utils' etc. internally
      '@': path.resolve(__dirname, '../packages/speech-widget/src'),
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry:    'src/index.ts',
      formats:  ['es', 'cjs'],
      fileName: (format) => `speech-widget.${format}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'xstate'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', xstate: 'XState' },
      },
    },
    minify:    'esbuild',
    sourcemap: false,
  },
})

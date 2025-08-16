import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        goals: resolve(__dirname, 'goals.html'),
        history: resolve(__dirname, 'history.html'),
        settings: resolve(__dirname, 'settings.html'),
        // NOTE: The resonance-chamber is in /public, so it's handled automatically
        // and does not need to be listed here.
      },
    },
  },
})
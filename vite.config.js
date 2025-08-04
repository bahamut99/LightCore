import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/.netlify/functions': {
        target: 'https://lightcorehealth.netlify.app',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        goals: resolve(__dirname, 'goals.html'),
        history: resolve(__dirname, 'history.html'), // This line fixes the broken link
      },
    },
  },
})
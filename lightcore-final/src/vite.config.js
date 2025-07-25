import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
})

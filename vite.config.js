import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// This configuration tells Vite to look for both index.html and goals.html
// in the same directory as this config file.
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
        main: './index.html',
        goals: './goals.html',
      },
    },
  },
})
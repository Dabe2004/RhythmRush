import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Listen on every network interface, so a phone on the same Wi-Fi can
    // open http://<your-computer-ip>:5173.
    host: true,
    // Forward API calls to Express. The browser only ever talks to 5173,
    // so there are no CORS problems in development.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})

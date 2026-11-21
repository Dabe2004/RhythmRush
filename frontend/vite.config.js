import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { FACT_FILES, readGameFacts } from './gameFacts.mjs'

// "virtual:game-facts": the brochure's numbers, read from the rule and model
// files at build time (only the small facts reach the browser).
function gameFacts() {
  const id = 'virtual:game-facts'
  return {
    name: 'game-facts',
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(resolved) {
      if (resolved !== `\0${id}`) return null
      Object.values(FACT_FILES).forEach((file) => this.addWatchFile(file))
      return `export default ${JSON.stringify(readGameFacts())}`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), gameFacts()],
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

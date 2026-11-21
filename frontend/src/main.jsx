import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

// Fonts are bundled from npm (@fontsource): no Google Fonts, no CDN, so the
// site also works at an exhibition without internet. Only the latin subset
// and the three weights that are used.
import '@fontsource/bungee/latin-400.css'
import '@fontsource/nunito/latin-400.css'
import '@fontsource/nunito/latin-800.css'

import './index.css'
import App from './App.jsx'

// Pause every decorative CSS animation while the tab is hidden
// (see "[data-tab-hidden]" in index.css). This does not touch any polling:
// usePolling already skips refreshes while the tab is hidden.
function syncTabHidden() {
  document.documentElement.toggleAttribute('data-tab-hidden', document.hidden)
}
syncTabHidden()
document.addEventListener('visibilitychange', syncTabHidden)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

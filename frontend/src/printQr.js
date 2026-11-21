// frontend/src/printQr.js
// The QR code on the PRINTED brochure only (never on screen). Encoded in the
// browser with lean-qr/nano (about 4 kB, no network). Tested in
// content/howToPlay.test.js.

import { correction, generate } from "lean-qr/nano"

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

// The booth address the QR points to, or null (then the paper says "Ask the
// staff"): 1. VITE_PUBLIC_URL, 2. this page's origin unless it is local.
export function qrAddress({ publicUrl, origin, hostname }) {
  const fixed = typeof publicUrl === "string" ? publicUrl.trim().replace(/\/+$/, "") : ""
  if (fixed) return fixed
  if (origin && hostname && !LOCAL_HOSTS.has(hostname)) return origin
  return null
}

export function qrTarget(address) {
  return `${address}/how-to-play`
}

// One SVG path for all dark modules, plus the size in modules. High error
// correction (H), so a scuffed or folded sign still scans.
export function qrPath(text) {
  const code = generate(text, { minCorrectionLevel: correction.H })
  let path = ""
  for (let y = 0; y < code.size; y += 1) {
    for (let x = 0; x < code.size; x += 1) {
      if (code.get(x, y)) path += `M${x} ${y}h1v1h-1z`
    }
  }
  return { size: code.size, path }
}

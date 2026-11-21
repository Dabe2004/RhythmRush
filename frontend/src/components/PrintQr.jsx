// frontend/src/components/PrintQr.jsx
// The box at the bottom of the PRINTED brochure: "Join the booth Wi-Fi
// first", the Wi-Fi name (or a line to write it in), and the QR code. Always
// in the page (so printing is reliable) but hidden on screen by the
// .print-only CSS rule: no QR is ever shown on a screen. Address rule and
// encoding: printQr.js.

import { qrAddress, qrPath, qrTarget } from "../printQr"

const QUIET = 4 // modules of white border around the code

export default function PrintQr({
  ui,
  location = typeof window === "undefined" ? null : window.location,
  env = import.meta.env,
}) {
  const address = qrAddress({ publicUrl: env.VITE_PUBLIC_URL, origin: location?.origin, hostname: location?.hostname })
  const wifi = env.VITE_WIFI_NAME?.trim()
  // Printed only when set on purpose: then anyone can read it on the paper.
  const password = env.VITE_WIFI_PASSWORD?.trim()

  let code = <p className="print-qr-staff">{ui.noAddress}</p>
  if (address) {
    const target = qrTarget(address)
    const { size, path } = qrPath(target)
    const box = size + QUIET * 2
    code = (
      <div className="print-qr-code">
        <svg viewBox={`${-QUIET} ${-QUIET} ${box} ${box}`} role="img" aria-label={ui.qrCaption} data-url={target} shapeRendering="crispEdges">
          <rect x={-QUIET} y={-QUIET} width={box} height={box} fill="#fff" />
          <path d={path} fill="#000" />
        </svg>
        <div>
          <p className="print-qr-caption">{ui.qrCaption}</p>
          <p className="print-qr-address">{target}</p>
        </div>
      </div>
    )
  }

  return (
    <aside className="print-only print-qr">
      <p className="print-qr-wifi">{ui.wifiFirst}</p>
      <p className="print-qr-wifi-name">
        {ui.wifiLabel} {wifi ? <strong>{wifi}</strong> : <span className="print-qr-blank">{ui.wifiBlank}</span>}
      </p>
      {wifi && password ? (
        <p className="print-qr-wifi-name">
          {ui.wifiPassword} <strong>{password}</strong>
        </p>
      ) : null}
      {code}
    </aside>
  )
}

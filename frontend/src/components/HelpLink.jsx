// frontend/src/components/HelpLink.jsx
// A small "?" sign that opens the brochure at the right panel. The link is a
// 44 px tap area; the visible sign is smaller.

import { Link } from "react-router-dom"

import { visitorText } from "../content/visitorText"

// topic: "rank" or "animal" (the brochure anchors)
export default function HelpLink({ topic, className = "" }) {
  const label = visitorText.help[topic]
  return (
    <Link to={`/how-to-play#${topic}`} aria-label={label} title={label} className={`help-sign ${className}`}>
      <span aria-hidden="true">?</span>
    </Link>
  )
}

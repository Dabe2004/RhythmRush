// Shared frame for the animal illustrations: same canvas, same ink outline.
// Extra props (x, y, className, aria-hidden...) go to the <svg>, so an animal
// can also be drawn inside a chart.

export default function AnimalSvg({ label, size = 64, children, ...rest }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={label} {...rest}>
      <g stroke="#1d1a2f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  )
}

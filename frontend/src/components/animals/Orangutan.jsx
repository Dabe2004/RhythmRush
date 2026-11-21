import AnimalSvg from "./AnimalSvg"

// Orange shaggy hair, wide face with cheek pads.
export default function Orangutan(props) {
  return (
    <AnimalSvg label="Orangutan" {...props}>
      <path d="M20 15l4-8 5 6 4-8 4 7 5-6 3 9" fill="#d26a2a" />
      <ellipse cx="32" cy="33" rx="23" ry="21" fill="#d26a2a" />
      <path d="M12 33c0-8 9-11 20-11s20 3 20 11c0 11-9 20-20 20S12 44 12 33z" fill="#e8b07c" />
      <circle cx="25" cy="31" r="2.5" fill="#1d1a2f" stroke="none" />
      <circle cx="39" cy="31" r="2.5" fill="#1d1a2f" stroke="none" />
      <circle cx="29.5" cy="38" r="1.3" fill="#1d1a2f" stroke="none" />
      <circle cx="34.5" cy="38" r="1.3" fill="#1d1a2f" stroke="none" />
      <path d="M23 44q9 5 18 0" fill="none" />
    </AnimalSvg>
  )
}

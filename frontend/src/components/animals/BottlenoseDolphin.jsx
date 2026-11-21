import AnimalSvg from "./AnimalSvg"

// Round blue body facing right, short "bottle" nose, light belly, a grin.
export default function BottlenoseDolphin(props) {
  return (
    <AnimalSvg label="Bottlenose Dolphin" {...props}>
      <path d="M24 16c2-7 8-10 13-9-3 3-4 6-3 10" fill="#4f86cf" />
      <path
        d="M7 40c0-17 14-27 29-25 8 1 12 6 14 11l8 4c3 2 2 6-2 6h-6c-4 10-16 16-28 14C14 49 7 46 7 40z"
        fill="#4f86cf"
      />
      <path d="M13 44c9 5 21 4 31-4-4 8-14 11-24 10-3-1-6-3-7-6z" fill="#cfe2f7" />
      <circle cx="40" cy="26" r="2.6" fill="#1d1a2f" stroke="none" />
      <path d="M44 33q6 2 11 1" fill="none" />
      <path d="M8 40c-3-2-5-6-4-10 3 1 6 4 7 7" fill="#4f86cf" />
    </AnimalSvg>
  )
}

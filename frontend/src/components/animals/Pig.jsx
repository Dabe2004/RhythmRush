import AnimalSvg from "./AnimalSvg"

// Pink round head, pointy ears, a big snout.
export default function Pig(props) {
  return (
    <AnimalSvg label="Pig" {...props}>
      <path d="M15 23L12 8l14 7zM49 23l3-15-14 7z" fill="#f4a7b9" />
      <circle cx="32" cy="35" r="21" fill="#f4a7b9" />
      <ellipse cx="32" cy="41" rx="10" ry="7" fill="#e7809d" />
      <ellipse cx="28.5" cy="41" rx="1.6" ry="2.4" fill="#1d1a2f" stroke="none" />
      <ellipse cx="35.5" cy="41" rx="1.6" ry="2.4" fill="#1d1a2f" stroke="none" />
      <circle cx="24" cy="30" r="2.5" fill="#1d1a2f" stroke="none" />
      <circle cx="40" cy="30" r="2.5" fill="#1d1a2f" stroke="none" />
      <path d="M28 51q4 2 8 0" fill="none" />
    </AnimalSvg>
  )
}

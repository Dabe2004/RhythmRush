import AnimalSvg from "./AnimalSvg"

// Brown head, big round ears, light heart-shaped face.
export default function Chimpanzee(props) {
  return (
    <AnimalSvg label="Chimpanzee" {...props}>
      <circle cx="11" cy="33" r="7.5" fill="#7a4b2e" />
      <circle cx="53" cy="33" r="7.5" fill="#7a4b2e" />
      <circle cx="11" cy="33" r="3" fill="#e3b98d" stroke="none" />
      <circle cx="53" cy="33" r="3" fill="#e3b98d" stroke="none" />
      <circle cx="32" cy="32" r="21" fill="#7a4b2e" />
      <path d="M32 23c-6-6-16-3-14 7 1 9 5 20 14 20s13-11 14-20c2-10-8-13-14-7z" fill="#e3b98d" />
      <circle cx="26" cy="30" r="2.6" fill="#1d1a2f" stroke="none" />
      <circle cx="38" cy="30" r="2.6" fill="#1d1a2f" stroke="none" />
      <circle cx="29.5" cy="38" r="1.3" fill="#1d1a2f" stroke="none" />
      <circle cx="34.5" cy="38" r="1.3" fill="#1d1a2f" stroke="none" />
      <path d="M26 43q6 5 12 0" fill="none" />
      <path d="M27 12q5-4 10 0" fill="none" />
    </AnimalSvg>
  )
}

import AnimalSvg from "./AnimalSvg"

// Grey head, two big ears with pink insides, a curled trunk.
export default function Elephant(props) {
  return (
    <AnimalSvg label="Elephant" {...props}>
      <ellipse cx="13" cy="31" rx="11" ry="14" fill="#a3abbc" />
      <ellipse cx="51" cy="31" rx="11" ry="14" fill="#a3abbc" />
      <ellipse cx="14" cy="32" rx="5.5" ry="8.5" fill="#eab3c2" stroke="none" />
      <ellipse cx="50" cy="32" rx="5.5" ry="8.5" fill="#eab3c2" stroke="none" />
      <circle cx="32" cy="29" r="16" fill="#a3abbc" />
      <path d="M27 38c0 10 2 18 9 19 5 0 6-5 2-6-3-1-3-6-2-13" fill="#a3abbc" />
      <circle cx="26" cy="26" r="2.4" fill="#1d1a2f" stroke="none" />
      <circle cx="38" cy="26" r="2.4" fill="#1d1a2f" stroke="none" />
      <path d="M23 36q-3 2-2 5M41 36q3 2 2 5" fill="none" />
    </AnimalSvg>
  )
}

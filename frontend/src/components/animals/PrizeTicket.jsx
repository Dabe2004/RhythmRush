import AnimalSvg from "./AnimalSvg"

// Fallback for an unknown animal: a plain prize ticket.
export default function PrizeTicket({ label = "Prize ticket", ...props }) {
  return (
    <AnimalSvg label={label} {...props}>
      <path d="M5 18h54v9a5 5 0 0 0 0 10v9H5v-9a5 5 0 0 0 0-10z" fill="#f1d49b" />
      <path d="M20 20v24" fill="none" strokeDasharray="3 4" />
      <path d="M30 27h20M30 33h14M30 39h18" fill="none" strokeWidth="2.5" />
    </AnimalSvg>
  )
}

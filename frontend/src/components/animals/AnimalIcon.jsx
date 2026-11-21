// Picks the illustration for an animal name from the ML model.
// Unknown names (or a future label) get the prize-ticket fallback.

import BottlenoseDolphin from "./BottlenoseDolphin"
import Chimpanzee from "./Chimpanzee"
import Elephant from "./Elephant"
import Orangutan from "./Orangutan"
import Pig from "./Pig"
import PrizeTicket from "./PrizeTicket"

const ANIMALS = {
  Chimpanzee,
  "Bottlenose Dolphin": BottlenoseDolphin,
  Elephant,
  Orangutan,
  Pig,
}

export default function AnimalIcon({ animal, ...props }) {
  const Drawing = ANIMALS[animal] || PrizeTicket
  return <Drawing {...props} />
}

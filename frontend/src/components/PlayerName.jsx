// frontend/src/components/PlayerName.jsx
// A nickname, or "Player #N" for a game without one: N is the game's number
// (Player #1 for the first game saved, #2 for the next, and so on; the server
// stores it). Player #N is dark enough to read easily (11.4:1 on ticket paper)
// but stays secondary to real names: regular weight and a little smaller.

import { visitorText } from "../content/visitorText"

export default function PlayerName({ nickname, number }) {
  if (nickname) return nickname
  return <span className="player-number">{visitorText.common.player(number)}</span>
}

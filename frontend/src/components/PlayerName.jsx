// frontend/src/components/PlayerName.jsx
// A nickname, or "Mystery Player" for a game without one. Mystery Player is
// dark enough to read easily (11.4:1 on ticket paper) but stays secondary to
// real names: regular weight and a little smaller, never a pale grey.

export default function PlayerName({ nickname }) {
  if (nickname) return nickname
  return <span className="mystery-player">Mystery Player</span>
}

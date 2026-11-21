// frontend/src/leaderboard.js
// Pure helpers for the Top 10 page (tested in leaderboard.test.js).

// The public page shows the top 10 (the kiosk and the result page ask for
// their own numbers).
export const LEADERBOARD_LIMIT = 10

const TAP_HINT = "Tap a ticket to see how the game went."

// Subtitle under "Top 10". Empty when there are no scores: the empty state
// ("Step right up! ...") says it instead.
export function leaderboardSubtitle(count) {
  if (count >= LEADERBOARD_LIMIT) return `The ${LEADERBOARD_LIMIT} best scores so far. ${TAP_HINT}`
  if (count === 1) return `All 1 score so far. ${TAP_HINT}`
  if (count > 1) return `All ${count} scores so far. ${TAP_HINT}`
  return ""
}

// Splits the API entries (RANK() order) into the podium and the list.
// The podium is every entry ranked 1-3, so tied entries are never hidden or
// merged: a tie at rank 2 puts two "2" tickets on the podium, in API order.
//   champions - rank 1 (the biggest cards)
//   runnersUp - rank 2 and 3
//   rest      - rank 4 and lower (the compact list)
export function splitPodium(entries) {
  const list = Array.isArray(entries) ? entries : []

  return {
    champions: list.filter((entry) => Number(entry.rank) === 1),
    runnersUp: list.filter((entry) => Number(entry.rank) > 1 && Number(entry.rank) <= 3),
    rest: list.filter((entry) => Number(entry.rank) > 3),
  }
}

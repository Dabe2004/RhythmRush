// frontend/gameFacts.mjs
// Build-time facts for the "How to play" brochure, read from the real files
// (never typed by hand): docs/game_rules.json (written by ml/export_rules.py)
// and backend/artifacts/skill.json + animal.json. vite.config.js serves the
// result as the module "virtual:game-facts", so the 340 kB animal.json never
// reaches the browser; only these few numbers do.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const FACT_FILES = {
  rules: path.join(ROOT, "docs", "game_rules.json"),
  skill: path.join(ROOT, "backend", "artifacts", "skill.json"),
  animal: path.join(ROOT, "backend", "artifacts", "animal.json"),
}

function bonusAt(level, responseMs) {
  let bonus = 0
  for (const [fromMs, value] of level.speed_bonus_steps) if (fromMs <= responseMs) bonus = value
  return bonus
}

function leafFor(nodes, values) {
  let node = nodes[0]
  while (node.leaf === undefined) {
    node = nodes.find((n) => n.id === (values[node.feature] <= node.threshold ? node.left : node.right))
  }
  return node.leaf
}

// Speed ranges per rank, ONLY if the tree's answer depends on speed alone
// (checked over many values of the other three inputs). Otherwise null, and
// the brochure gives no numbers.
export function speedRanges(skill) {
  const speed = skill.features.indexOf("avg_reaction_sec")
  if (speed < 0) return null
  const others = [
    [0, 3000, 6000, 9000, 12497, 12498, 13000],
    [3, 6, 10, 14, 17],
    [0, 0.3, 0.6, 0.9, 1],
  ]
  const ranges = []
  for (let ms = 200; ms <= 3000; ms += 5) {
    const seconds = ms / 1000
    const answers = new Set()
    for (const score of others[0]) for (const length of others[1]) for (const rate of others[2]) {
      const values = []
      values[skill.features.indexOf("final_score")] = score
      values[skill.features.indexOf("highest_sequence_length")] = length
      values[skill.features.indexOf("success_rate")] = rate
      values[speed] = seconds
      answers.add(leafFor(skill.nodes, values))
    }
    if (answers.size !== 1) return null
    const rank = [...answers][0]
    const last = ranges[ranges.length - 1]
    if (last && last.rank === rank) last.to = seconds
    else ranges.push({ rank, from: seconds, to: seconds })
  }
  // One stretch per rank, fastest first, or no numbers at all.
  if (new Set(ranges.map((r) => r.rank)).size !== ranges.length) return null
  return ranges.map((r, i) => ({ rank: r.rank, under: i < ranges.length - 1 ? Number(ranges[i + 1].from.toFixed(2)) : null }))
}

export function buildGameFacts(rules, skill, animal) {
  const levels = rules.levels
  const first = levels[0]
  const shortestMs = Math.min(...levels.map((l) => l.deadline_ms))
  const exampleMs = Math.round((first.sequence_length * first.deadline_ms) / 2)
  const exampleBonus = bonusAt(first, exampleMs)
  const tiers = [...animal.tiers].sort((a, b) => b.percentile_min - a.percentile_min)

  return {
    lives: rules.start_lives,
    levels: rules.max_level,
    pointsPerLevel: first.base_points / first.level,
    bonusMax: Math.max(...levels.flatMap((l) => l.speed_bonus_steps.map(([, bonus]) => bonus))),
    firstLimitSeconds: first.deadline_ms / 1000,
    shortestLimitSeconds: shortestMs / 1000,
    shortestFromLevel: levels.find((l) => l.deadline_ms === shortestMs).level,
    startLights: first.sequence_length,
    example: {
      lights: first.sequence_length,
      seconds: exampleMs / 1000,
      levelPoints: first.base_points,
      bonus: exampleBonus,
      total: first.base_points + exampleBonus,
    },
    animals: tiers.map((tier, i) => ({
      animal: tier.animal,
      percent: Math.round(((i === 0 ? 1 : tiers[i - 1].percentile_min) - tier.percentile_min) * 100),
      top: i === 0,
      rest: i === tiers.length - 1,
      iq: tier.iq_range,
    })),
    ranks: speedRanges(skill),
  }
}

export function readGameFacts() {
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
  return buildGameFacts(read(FACT_FILES.rules), read(FACT_FILES.skill), read(FACT_FILES.animal))
}

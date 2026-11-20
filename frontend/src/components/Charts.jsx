// frontend/src/components/Charts.jsx
// The Recharts charts of the session detail and admin pages.
//
// Both pages are lazy-loaded (React.lazy in App.jsx), so Recharts is only
// downloaded when one of them is opened; the leaderboard and kiosk stay small.
//
// Chart rules used here:
//   - thin bars (max 24 px) with 4 px rounded ends, square at the baseline
//   - hairline horizontal grid, quiet axes, no animation on refresh
//   - text always uses the grey "ink" colours, never the bar colour
//   - one series = one colour and no legend box (the heading names it)
//   - colour is never the only signal (labels, legend, tooltip, table)

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { RESULT_STYLES } from "../chartData"
import { animalEmoji } from "../theme"

// Ink and chrome colours (Tailwind slate) for the dark theme.
const INK = {
  primary: "#f1f5f9",
  secondary: "#cbd5e1",
  muted: "#94a3b8",
  grid: "#1e293b",
  axis: "#334155",
}

// Single-series bar colour, validated on the dark surfaces (>= 3:1).
const SERIES_COLOR = "#3987e5"

const AXIS_TICK = { fill: INK.muted, fontSize: 12 }
// Hover highlight behind the hovered bar: a faint wash, no outline.
const HOVER_CURSOR = { fill: "rgba(148, 163, 184, 0.08)", stroke: "none" }

function TooltipBox({ children }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-sm shadow-xl">
      {children}
    </div>
  )
}

// Small colour key placed BESIDE text (the text itself stays grey/white).
function Swatch({ result }) {
  const style = RESULT_STYLES[result]
  const hollow = result === "timeout"
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 shrink-0 rounded-[3px]"
      style={{
        backgroundColor: hollow ? `${style.color}26` : style.color,
        boxShadow: hollow ? `inset 0 0 0 2px ${style.color}` : undefined,
      }}
    />
  )
}

export function ResultLabel({ result }) {
  const style = RESULT_STYLES[result]
  if (!style) return <span className="text-slate-400">{String(result)}</span>
  return (
    <span className="inline-flex items-center gap-2">
      <Swatch result={result} />
      <span>{style.label}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Session detail: response time per attempt
// ---------------------------------------------------------------------------
function AttemptTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload

  return (
    <TooltipBox>
      <p className="font-semibold text-slate-100">
        Attempt {row.attemptNo} · Level {row.level}
      </p>
      <p className="mt-1 flex items-center gap-2 text-slate-200">
        <Swatch result={row.result} />
        {row.isTimeout
          ? "Timeout: no answer in time"
          : `${RESULT_STYLES[row.result]?.label ?? row.result} after ${row.responseSec.toFixed(2)} s`}
      </p>
      <p className="mt-1 text-slate-400">
        {row.sequenceLength} presses, time limit {row.deadlineSec.toFixed(1)} s
      </p>
    </TooltipBox>
  )
}

// "Timeout" written inside the hollow bar (vertical), only when it fits.
function TimeoutLabel({ x, y, width, height, index, rows }) {
  if (!rows[index]?.isTimeout || height < 64) return null

  const cx = x + width / 2
  const cy = y + height / 2
  return (
    <text
      x={cx}
      y={cy}
      transform={`rotate(-90 ${cx} ${cy})`}
      textAnchor="middle"
      dominantBaseline="central"
      fill={INK.primary}
      fontSize={12}
      fontWeight={600}
    >
      Timeout
    </text>
  )
}

export function ResultLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
      <li className="flex items-center gap-2">
        <Swatch result="pass" /> Pass (response time)
      </li>
      <li className="flex items-center gap-2">
        <Swatch result="wrong" /> Wrong (time until the wrong press)
      </li>
      <li className="flex items-center gap-2">
        <Swatch result="timeout" /> Timeout (drawn at the full time limit)
      </li>
    </ul>
  )
}

export function AttemptsChart({ rows }) {
  return (
    <figure className="space-y-4">
      <ResultLegend />
      <div
        className="h-80 w-full"
        role="img"
        aria-label="Bar chart of the response time of every attempt. The attempts table below lists the same values."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 16 }} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke={INK.grid} />
            <XAxis
              dataKey="attemptNo"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: INK.axis }}
              label={{ value: "Attempt", position: "insideBottom", offset: -10, fill: INK.muted, fontSize: 12 }}
            />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(value) => `${value} s`}
            />
            <Tooltip cursor={HOVER_CURSOR} content={<AttemptTooltip />} />
            <Bar dataKey="chartValue" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {rows.map((row) => {
                const color = RESULT_STYLES[row.result]?.color ?? INK.muted
                return (
                  <Cell
                    key={row.attemptNo}
                    fill={color}
                    // Timeouts are hollow: a light wash plus an outline.
                    fillOpacity={row.isTimeout ? 0.15 : 1}
                    stroke={row.isTimeout ? color : "none"}
                    strokeWidth={row.isTimeout ? 2 : 0}
                  />
                )
              })}
              <LabelList dataKey="chartValue" content={(props) => <TimeoutLabel {...props} rows={rows} />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm text-slate-400">
        A timeout has no response time, so its bar shows the full time limit of that level
        (presses × seconds per press) instead of a zero-height bar.
      </figcaption>
    </figure>
  )
}

// ---------------------------------------------------------------------------
// Admin: score histogram (one series, columns)
// ---------------------------------------------------------------------------
function HistogramTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <TooltipBox>
      <p className="font-semibold text-slate-100">{row.range} points</p>
      <p className="mt-1 text-slate-300">
        {row.count} {row.count === 1 ? "game" : "games"}
      </p>
    </TooltipBox>
  )
}

export function ScoreHistogram({ rows }) {
  return (
    <div
      className="h-72 w-full"
      role="img"
      aria-label="Column chart: number of games per 1,000-point score range."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 16 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: INK.axis }}
            label={{ value: "Score (points)", position: "insideBottom", offset: -10, fill: INK.muted, fontSize: 12 }}
          />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
          <Tooltip cursor={HOVER_CURSOR} content={<HistogramTooltip />} />
          <Bar
            dataKey="count"
            fill={SERIES_COLOR}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Admin: counts per label (skill, animal) as horizontal bars
// ---------------------------------------------------------------------------
function CountTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <TooltipBox>
      <p className="font-semibold text-slate-100">{row.name}</p>
      <p className="mt-1 text-slate-300">
        {row.count} {row.count === 1 ? "game" : "games"}
      </p>
    </TooltipBox>
  )
}

/**
 * @param {{rows: {name: string, count: number}[], withEmoji?: boolean, label: string}} props
 */
export function CountBars({ rows, withEmoji = false, label }) {
  const height = rows.length * 44 + 24

  return (
    <div className="w-full" style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={withEmoji ? 168 : 112}
            tick={{ fill: INK.secondary, fontSize: 13 }}
            tickLine={false}
            axisLine={{ stroke: INK.axis }}
            tickFormatter={(name) => (withEmoji ? `${animalEmoji(name)} ${name}` : name)}
          />
          <Tooltip cursor={HOVER_CURSOR} content={<CountTooltip />} />
          <Bar
            dataKey="count"
            fill={SERIES_COLOR}
            maxBarSize={24}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          >
            {/* Value at the bar tip, in ink colour. Few bars, so all are labelled. */}
            <LabelList dataKey="count" position="right" fill={INK.secondary} fontSize={13} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

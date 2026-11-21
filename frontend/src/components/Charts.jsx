// frontend/src/components/Charts.jsx
// The Recharts chart of the session detail page.
//
// The page is lazy-loaded (React.lazy in App.jsx), so Recharts is only
// downloaded when it is opened; the leaderboard and kiosk stay small.
//
// Chart rules used here:
//   - thin bars (max 24 px) with 4 px rounded ends, square at the baseline
//   - hairline grid, ink axis line, numbers in the display face (Bungee)
//   - text always uses the ink colours, never the bar colour
//   - one series = one colour and no legend box (the heading names it)
//   - colour is never the only signal (labels, legend, tooltip, table)
// The result colours were validated for colour blindness and contrast on
// the cream ticket surface (docs/DESIGN.md).

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
import { visitorText } from "../content/visitorText"

const C = visitorText.chart

// Ink and chrome colours of the carnival theme (cream paper).
const INK = {
  primary: "#1d1a2f",
  muted: "#5c5468",
  grid: "#d8c9a6",
  axis: "#1d1a2f",
}

const NUMBER_TICK = { fill: INK.primary, fontSize: 12, fontFamily: "Bungee, sans-serif" }
// Hover highlight behind the hovered bar: a faint ink wash, no outline.
const HOVER_CURSOR = { fill: "rgba(29, 26, 47, 0.07)", stroke: "none" }

// Tooltip drawn as a small paper ticket.
function TooltipBox({ children }) {
  return (
    <div className="rounded-[4px] border-2 border-ink bg-ticket px-3 py-2 text-sm text-ink shadow-hard-sm">
      {children}
    </div>
  )
}

// Small colour key placed BESIDE text (the text itself stays ink).
function Swatch({ result }) {
  const style = RESULT_STYLES[result]
  const hollow = result === "timeout"
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px]"
      style={{
        backgroundColor: hollow ? `${style.color}26` : style.color,
        boxShadow: hollow ? `inset 0 0 0 2px ${style.color}` : "inset 0 0 0 1.5px #1d1a2f",
      }}
    />
  )
}

export function ResultLabel({ result }) {
  const style = RESULT_STYLES[result]
  if (!style) return <span className="text-muted">{String(result)}</span>
  return (
    <span className="inline-flex items-center gap-2">
      <Swatch result={result} />
      <span className="font-extrabold">{style.label}</span>
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
      <p className="font-sign">
        {C.tryLine(row.attemptNo, row.level)}
      </p>
      <p className="mt-1 flex items-center gap-2 font-extrabold">
        <Swatch result={row.result} />
        {row.isTimeout
          ? C.outOfTime
          : C.after(RESULT_STYLES[row.result]?.label ?? row.result, row.responseSec.toFixed(2))}
      </p>
      <p className="mt-1 text-muted">
        {C.limitLine(row.sequenceLength, row.deadlineSec.toFixed(1))}
      </p>
    </TooltipBox>
  )
}

// "Out of time" written inside the hollow bar (vertical), only when it fits.
function TimeoutLabel({ x, y, width, height, index, rows }) {
  if (!rows[index]?.isTimeout || height < 110) return null

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
      fontFamily="Bungee, sans-serif"
    >
      {C.barLabel}
    </text>
  )
}

export function ResultLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      <li className="flex items-center gap-2">
        <Swatch result="pass" /> {C.legend.pass}
      </li>
      <li className="flex items-center gap-2">
        <Swatch result="wrong" /> {C.legend.wrong}
      </li>
      <li className="flex items-center gap-2">
        <Swatch result="timeout" /> {C.legend.timeout}
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
        aria-label={C.description}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 16 }} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke={INK.grid} />
            <XAxis
              dataKey="attemptNo"
              tick={NUMBER_TICK}
              tickLine={false}
              axisLine={{ stroke: INK.axis, strokeWidth: 2 }}
              label={{ value: C.xAxis, position: "insideBottom", offset: -10, fill: INK.muted, fontSize: 12 }}
            />
            {/* Plain numbers on the ticks; the unit is the axis label (Bungee
                has no lowercase, so "16 s" would read "16 S"). */}
            <YAxis
              tick={NUMBER_TICK}
              tickLine={false}
              axisLine={false}
              width={56}
              label={{ value: C.yAxis, angle: -90, position: "insideLeft", offset: 10, fill: INK.muted, fontSize: 12 }}
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
      <figcaption className="text-sm text-muted">
        {C.caption}
      </figcaption>
    </figure>
  )
}

// frontend/src/pages/Admin.jsx
// /admin - moderator dashboard. Reachable by typing the URL only (it is NOT
// linked in the public header).
//
// - The password is kept ONLY in sessionStorage (adminAuth.js) and sent as
//   the X-Admin-Password header. It is cleared on logout and on any 401.
// - Everything refreshes every 15 seconds. A failed refresh keeps the old
//   data on screen and shows a banner.
// - Destructive actions ask for confirmation first.
//
// Lazy-loaded from App.jsx because it pulls in Recharts.

import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import {
  adminDeleteDeviceGames,
  adminDeleteSession,
  adminLogin,
  adminSetNickname,
  getAdminModels,
  getAdminOverview,
} from "../api"
import {
  adminErrorMessage,
  clearAdminPassword,
  loadAdminPassword,
  saveAdminPassword,
} from "../adminAuth"
import { countsToRows, histogramRows } from "../chartData"
import { CountBars, ScoreHistogram } from "../components/Charts"
import StatusMessage from "../components/StatusMessage"
import {
  formatBytes,
  formatDateTime,
  formatPercent,
  formatRelative,
  formatScore,
} from "../format"
import usePolling from "../usePolling"

const REFRESH_MS = 15000
const SIMULATED_DEVICE = "SIM01"
const SKILL_ORDER = ["Beginner", "Intermediate", "Pro"]
const ANIMAL_ORDER = ["Chimpanzee", "Bottlenose Dolphin", "Elephant", "Orangutan", "Pig"]

const BUTTON_BASE =
  "rounded-lg px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"

export default function Admin() {
  const [password, setPassword] = useState(() => loadAdminPassword())
  const [notice, setNotice] = useState("")

  const logout = useCallback((message = "") => {
    clearAdminPassword()
    setPassword("")
    setNotice(message)
  }, [])

  const loggedIn = useCallback((value) => {
    saveAdminPassword(value)
    setPassword(value)
    setNotice("")
  }, [])

  if (!password) {
    return <LoginForm notice={notice} onLoggedIn={loggedIn} />
  }

  return <Dashboard password={password} onLogout={logout} />
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
function LoginForm({ notice, onLoggedIn }) {
  const [value, setValue] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busyRef.current) return
    if (!value) {
      setMessage("Enter the admin password.")
      return
    }

    busyRef.current = true
    setBusy(true)
    setMessage("")
    try {
      await adminLogin(value)
      onLoggedIn(value)
    } catch (error) {
      setMessage(adminErrorMessage(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-black tracking-tight text-white">Admin</h1>
      <p className="mt-2 text-slate-400">For the people running the exhibition.</p>

      {notice ? (
        <p role="status" className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-amber-100">
          {notice}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <label htmlFor="admin-password" className="block font-semibold text-white">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={value}
          disabled={busy}
          onChange={(event) => setValue(event.target.value)}
          className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-lg text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-indigo-500 px-6 py-3 text-lg font-bold text-white transition hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 disabled:opacity-60"
        >
          {busy ? "Checking..." : "Log in"}
        </button>
        <p role="alert" className="min-h-[1.5rem] font-semibold text-red-300">
          {message}
        </p>
      </form>
      <p className="mt-4 text-sm text-slate-500">
        The password is kept in this browser tab only and is forgotten when you close it.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function Dashboard({ password, onLogout }) {
  const overview = usePolling(() => getAdminOverview(password), REFRESH_MS)
  const models = usePolling(() => getAdminModels(password), REFRESH_MS)
  const refreshOverview = overview.retry

  // A 401 means the password changed on the server: forget it.
  useEffect(() => {
    if (overview.error?.status === 401 || models.error?.status === 401) {
      onLogout("The password was not accepted any more. Please log in again.")
    }
  }, [overview.error, models.error, onLogout])

  // One action at a time (delete, clear nickname, remove simulated games).
  const [busyKey, setBusyKey] = useState(null)
  const [actionMessage, setActionMessage] = useState(null)
  const busyRef = useRef(false)

  const runAction = useCallback(
    async (key, action, successText) => {
      if (busyRef.current) return false
      busyRef.current = true
      setBusyKey(key)
      setActionMessage(null)
      try {
        const result = await action()
        setActionMessage({ ok: true, text: successText(result) })
        return true
      } catch (error) {
        if (error.status === 401) {
          onLogout("The password was not accepted any more. Please log in again.")
          return false
        }
        setActionMessage({ ok: false, text: adminErrorMessage(error) })
        return false
      } finally {
        busyRef.current = false
        setBusyKey(null)
        refreshOverview()
      }
    },
    [onLogout, refreshOverview],
  )

  const data = overview.data
  const updated = overview.lastUpdated
    ? overview.lastUpdated.toLocaleTimeString("en-GB", { hour12: false })
    : "--:--:--"

  return (
    <section className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8 sm:px-6 lg:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white">Admin</h1>
          <p className="mt-1 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Updated {updated} · refreshes every 15 s
          </p>
        </div>
        <button
          type="button"
          onClick={() => onLogout("You are logged out.")}
          className={`${BUTTON_BASE} border border-slate-600 px-4 py-2 text-slate-200 hover:bg-slate-800 focus-visible:ring-slate-300`}
        >
          Log out
        </button>
      </div>

      <nav aria-label="Admin sections" className="flex flex-wrap gap-2 text-sm">
        {[
          ["overview", "Overview"],
          ["charts", "Charts"],
          ["devices", "Devices"],
          ["recent", "Recent games"],
          ["cleanup", "Clean-up"],
          ["models", "Models"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {label}
          </a>
        ))}
      </nav>

      {overview.error && data && overview.error.status !== 401 ? (
        <StatusMessage
          variant="error"
          compact
          error={{ message: adminErrorMessage(overview.error) }}
          onRetry={overview.retry}
          title="Could not refresh. Showing the last known data."
        />
      ) : null}

      {actionMessage ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 font-semibold ${
            actionMessage.ok
              ? "border-green-400/40 bg-green-500/10 text-green-100"
              : "border-red-400/40 bg-red-500/10 text-red-100"
          }`}
        >
          {actionMessage.text}
        </p>
      ) : null}

      {!data && overview.error && overview.error.status !== 401 ? (
        <StatusMessage
          variant="error"
          error={{ message: adminErrorMessage(overview.error) }}
          onRetry={overview.retry}
          title="Could not load the admin data"
        />
      ) : null}

      {!data && !overview.error ? (
        <p role="status" className="text-lg text-slate-400">
          Loading...
        </p>
      ) : null}

      {data ? (
        <>
          <OverviewCards data={data} />
          <ChartsSection data={data} />
          <DevicesTable devices={data.devices} />
          <RecentGames
            sessions={data.recent_sessions}
            busyKey={busyKey}
            onClearNickname={(session) => {
              if (!window.confirm(`Clear the nickname "${session.nickname}" of game ${session.session_id}?`)) return
              runAction(
                `nick:${session.session_id}`,
                () => adminSetNickname(password, session.session_id, null),
                () => `Nickname of ${session.session_id} cleared.`,
              )
            }}
            onDelete={(session) => {
              if (
                !window.confirm(
                  `Delete game ${session.session_id} (score ${formatScore(session.final_score)})?\nThis cannot be undone.`,
                )
              ) {
                return
              }
              runAction(
                `del:${session.session_id}`,
                () => adminDeleteSession(password, session.session_id),
                () => `Game ${session.session_id} deleted.`,
              )
            }}
          />
          <RemoveSimulated
            count={data.devices?.find((d) => d.device_id === SIMULATED_DEVICE)?.games_count ?? 0}
            busy={busyKey === "sim"}
            disabled={busyKey !== null}
            onConfirm={() =>
              runAction(
                "sim",
                () => adminDeleteDeviceGames(password, SIMULATED_DEVICE),
                (result) => `Removed ${result.deleted} simulated game(s).`,
              )
            }
          />
        </>
      ) : null}

      <ModelsSection models={models} />
    </section>
  )
}

function SectionTitle({ id, children, hint }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="scroll-mt-6 text-2xl font-bold text-white">
        {children}
      </h2>
      {hint ? <p className="mt-1 text-sm text-slate-400">{hint}</p> : null}
    </div>
  )
}

function StatTile({ label, value, note }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-4xl font-bold text-white">{value}</p>
      {note ? <p className="mt-1 text-sm text-slate-500">{note}</p> : null}
    </div>
  )
}

function OverviewCards({ data }) {
  const counts = data.game_counts || { real: 0, synthetic: 0 }
  return (
    <div>
      <SectionTitle id="overview">Overview</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total games" value={formatScore(data.total_games)} />
        <StatTile
          label="Average score"
          value={data.average_score === null ? "-" : formatScore(Math.round(data.average_score))}
          note={data.max_score === null ? null : `Best ${formatScore(data.max_score)}`}
        />
        <StatTile
          label="Win rate"
          value={formatPercent(data.win_rate)}
          note={`${data.outcomes?.win ?? 0} wins, ${data.outcomes?.game_over ?? 0} game overs`}
        />
        <StatTile
          label="Real games"
          value={formatScore(counts.real)}
          note={`${formatScore(counts.synthetic)} simulated`}
        />
      </div>
    </div>
  )
}

function ChartsSection({ data }) {
  return (
    <div className="space-y-4">
      <SectionTitle id="charts" hint="Hover a bar for the exact number.">
        Charts
      </SectionTitle>
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
        <h3 className="mb-3 font-bold text-white">Games per score range</h3>
        <ScoreHistogram rows={histogramRows(data.score_histogram)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <h3 className="mb-3 font-bold text-white">Games per skill level</h3>
          <CountBars
            rows={countsToRows(data.skill_counts, SKILL_ORDER)}
            label="Bar chart: number of games per predicted skill level."
          />
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <h3 className="mb-3 font-bold text-white">Games per animal</h3>
          <CountBars
            rows={countsToRows(data.animal_counts, ANIMAL_ORDER)}
            withEmoji
            label="Bar chart: number of games per matched animal."
          />
          <p className="mt-2 text-sm text-slate-500">Animal IQ is just for fun, not a real IQ test.</p>
        </div>
      </div>
    </div>
  )
}

function OnlineBadge({ online }) {
  return online ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-green-500/15 px-3 py-1 text-sm font-semibold text-green-200 ring-1 ring-inset ring-green-400/40">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-green-400" /> Online
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-500/15 px-3 py-1 text-sm font-semibold text-slate-300 ring-1 ring-inset ring-slate-500/40">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-slate-500" /> Offline
    </span>
  )
}

function DevicesTable({ devices }) {
  const list = Array.isArray(devices) ? devices : []
  return (
    <div>
      <SectionTitle id="devices" hint="Online = uploaded a game or asked for difficulty in the last 10 minutes.">
        Devices
      </SectionTitle>
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead className="bg-slate-950/60 text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3">Device</th>
              <th scope="col" className="px-4 py-3">Name</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Last seen</th>
              <th scope="col" className="px-4 py-3 text-right">Games</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {list.map((device) => (
              <tr key={device.device_id}>
                <td className="px-4 py-3 font-mono">{device.device_id}</td>
                <td className="px-4 py-3">{device.name || "-"}</td>
                <td className="px-4 py-3">
                  <OnlineBadge online={device.is_online} />
                </td>
                <td className="px-4 py-3" title={formatDateTime(device.last_seen_at)}>
                  {formatRelative(device.last_seen_at)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatScore(device.games_count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RecentGames({ sessions, busyKey, onClearNickname, onDelete }) {
  const list = Array.isArray(sessions) ? sessions : []
  return (
    <div>
      <SectionTitle id="recent" hint="The 20 newest games. Both actions ask for confirmation.">
        Recent games
      </SectionTitle>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-700 px-6 py-8 text-center text-slate-400">
          No games yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-slate-950/60 text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3">Received</th>
                <th scope="col" className="px-4 py-3">Game</th>
                <th scope="col" className="px-4 py-3">Device</th>
                <th scope="col" className="px-4 py-3 text-right">Score</th>
                <th scope="col" className="px-4 py-3">Nickname</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {list.map((session) => (
                <tr key={session.session_id}>
                  <td className="px-4 py-3 text-sm" title={formatDateTime(session.received_at)}>
                    {formatRelative(session.received_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/session/${encodeURIComponent(session.session_id)}`}
                      className="font-mono text-sm text-indigo-300 hover:text-indigo-200"
                    >
                      {session.session_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">{session.device_id ?? "-"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatScore(session.final_score)}</td>
                  <td className="px-4 py-3">
                    {session.nickname ? session.nickname : <span className="text-slate-500">none</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {session.nickname ? (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => onClearNickname(session)}
                          className={`${BUTTON_BASE} border border-slate-600 text-slate-200 hover:bg-slate-800 focus-visible:ring-slate-300`}
                        >
                          {busyKey === `nick:${session.session_id}` ? "Clearing..." : "Clear nickname"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => onDelete(session)}
                        className={`${BUTTON_BASE} border border-red-400/50 bg-red-500/10 text-red-100 hover:bg-red-500/25 focus-visible:ring-red-300`}
                      >
                        {busyKey === `del:${session.session_id}` ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RemoveSimulated({ count, busy, disabled, onConfirm }) {
  const [typed, setTyped] = useState("")
  const ready = typed.trim() === SIMULATED_DEVICE

  return (
    <div>
      <SectionTitle id="cleanup">Clean-up</SectionTitle>
      <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5">
        <h3 className="font-bold text-white">Remove simulated games</h3>
        <p className="mt-1 text-slate-300">
          Deletes every game uploaded by the fake device <span className="font-mono">{SIMULATED_DEVICE}</span>{" "}
          ({formatScore(count)} now), with their attempts and predictions. Real devices such as{" "}
          <span className="font-mono">RR01</span> are never touched.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!ready || disabled) return
            if (await onConfirm()) setTyped("")
          }}
        >
          <div className="flex-1">
            <label htmlFor="confirm-sim" className="block text-sm text-slate-300">
              Type <span className="font-mono font-bold">{SIMULATED_DEVICE}</span> to confirm
            </label>
            <input
              id="confirm-sim"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-2 font-mono text-white focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/40"
            />
          </div>
          <button
            type="submit"
            disabled={!ready || disabled}
            className={`${BUTTON_BASE} bg-red-600 px-5 py-2.5 text-white hover:bg-red-500 focus-visible:ring-red-300`}
          >
            {busy ? "Removing..." : "Remove simulated games"}
          </button>
        </form>
      </div>
    </div>
  )
}

function ModelDetails({ model }) {
  if (model.error) {
    return <span className="text-red-300">{model.error === "missing" ? "File missing" : "Unreadable JSON"}</span>
  }
  if (model.name === "skill") {
    return <span>{model.node_count} tree nodes, {model.features?.length ?? 0} features</span>
  }
  if (model.name === "animal") {
    return (
      <span>
        {formatScore(model.reference_rows)} reference games;{" "}
        {(model.tiers || []).map((tier) => `${tier.animal} ≥ ${Math.round(tier.percentile_min * 100)}%`).join(", ")}
      </span>
    )
  }
  if (model.name === "difficulty" && model.weights) {
    const w = model.weights
    return (
      <span className="font-mono text-sm">
        {Number(model.intercept).toFixed(3)} + {Number(w.accuracy).toFixed(3)}·accuracy{" "}
        {Number(w.reactionRatio) < 0 ? "−" : "+"} {Math.abs(Number(w.reactionRatio)).toFixed(3)}·reactionRatio +{" "}
        {Number(w.level).toFixed(3)}·level
      </span>
    )
  }
  return <span>-</span>
}

function ModelsSection({ models }) {
  const list = Array.isArray(models.data?.models) ? models.data.models : []
  return (
    <div>
      <SectionTitle
        id="models"
        hint="Files in backend/artifacts. The server loads them once: restart it after retraining."
      >
        Models
      </SectionTitle>
      {models.error && models.error.status !== 401 ? (
        <p className="mb-3 text-sm font-semibold text-red-300">{adminErrorMessage(models.error)}</p>
      ) : null}
      {list.length === 0 ? (
        <p className="text-slate-400">{models.loading ? "Loading..." : "No model information."}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-slate-950/60 text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3">Model</th>
                <th scope="col" className="px-4 py-3">Version</th>
                <th scope="col" className="px-4 py-3 text-right">Size</th>
                <th scope="col" className="px-4 py-3">Last modified</th>
                <th scope="col" className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {list.map((model) => (
                <tr key={model.name}>
                  <td className="px-4 py-3">
                    <span className="font-semibold capitalize">{model.name}</span>
                    <span className="block font-mono text-xs text-slate-500">{model.file}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{model.version ?? "-"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBytes(model.size_bytes)}</td>
                  <td className="px-4 py-3 text-sm">
                    {model.modified_at ? new Date(model.modified_at).toLocaleString("en-GB", { hour12: false }) : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    <ModelDetails model={model} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

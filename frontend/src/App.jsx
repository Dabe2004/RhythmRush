// frontend/src/App.jsx
// Shell: header, routes, footer. The router itself is in main.jsx.

import { Suspense, lazy } from "react"
import { Link, NavLink, Route, Routes } from "react-router-dom"

import Leaderboard from "./pages/Leaderboard"
import Result from "./pages/Result"
import { ARCADE_COLORS } from "./theme"

// These two pages use Recharts. Loading them lazily keeps the chart library
// out of the main bundle, so the leaderboard and the kiosk load fast.
const SessionDetail = lazy(() => import("./pages/SessionDetail"))
const Admin = lazy(() => import("./pages/Admin"))

function PageLoading() {
  return (
    <p role="status" className="mx-auto w-full max-w-6xl px-4 py-10 text-lg text-slate-400 sm:px-6">
      Loading...
    </p>
  )
}

function NotFound() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
      <p className="text-sm font-bold uppercase tracking-[0.3em] text-indigo-300">
        404
      </p>
      <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
        Page not found
      </h1>
      <p className="mt-4 text-lg text-slate-400">
        That screen does not exist in Rhythm Rush.
      </p>
      <Link
        to="/"
        className="mt-8 inline-block rounded-xl bg-indigo-500 px-6 py-3 text-lg font-bold text-white transition hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
      >
        Back to the leaderboard
      </Link>
    </section>
  )
}

// Public header links. The admin page is deliberately NOT listed here; it is
// reachable by typing /admin only.
const NAV_LINKS = [
  { to: "/", label: "Leaderboard", end: true },
  { to: "/result", label: "Live screen", end: false },
]

function navClasses({ isActive }) {
  return `rounded-xl px-3 py-2 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 sm:px-4 sm:text-base ${
    isActive
      ? "bg-indigo-500 text-white shadow-lg shadow-indigo-900/50"
      : "text-slate-300 hover:bg-slate-800 hover:text-white"
  }`
}

export default function App() {
  return (
    <div className="arcade-grid flex min-h-screen flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            to="/"
            className="text-2xl font-black tracking-tight text-white transition hover:text-indigo-300 sm:text-3xl"
          >
            Rhythm Rush
          </Link>

          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={navClasses}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* The six arcade button colours, in button order. */}
          <div className="hidden items-center gap-2 md:flex" aria-label="Six arcade colours">
            {ARCADE_COLORS.map((color) => (
              <span
                key={color.name}
                title={color.name}
                className="h-3 w-3 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.25)] sm:h-4 sm:w-4"
                style={{ backgroundColor: color.hex }}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Leaderboard />} />
            <Route path="/result" element={<Result />} />
            <Route path="/result/:sessionId" element={<Result />} />
            <Route path="/session/:id" element={<SessionDetail />} />
            {/* Not linked anywhere: reachable by typing /admin only. */}
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>

      <footer className="border-t border-slate-800 bg-slate-950/60 px-4 py-5 text-center text-sm text-slate-500">
        Animal IQ is just for fun, not a real IQ test.
      </footer>
    </div>
  )
}

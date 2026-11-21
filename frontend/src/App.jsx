// frontend/src/App.jsx
// Shell: the striped awning header, routes, the bunting footer.
// The router itself is in main.jsx.

import { Suspense, lazy } from "react"
import { Link, NavLink, Route, Routes } from "react-router-dom"

import ArcadeButtons from "./components/ArcadeButtons"
import { Bunting, MarqueeBulbs, Scallops } from "./components/Decor"
import Leaderboard from "./pages/Leaderboard"
import Result from "./pages/Result"

// These two pages use Recharts. Loading them lazily keeps the chart library
// out of the main bundle, so the leaderboard and the kiosk load fast.
const SessionDetail = lazy(() => import("./pages/SessionDetail"))
const Admin = lazy(() => import("./pages/Admin"))

function PageLoading() {
  return (
    <div role="status" className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-14 sm:px-6">
      <ArcadeButtons sequence size="2.25rem" />
      <p className="font-sign text-lg">Loading...</p>
    </div>
  )
}

function NotFound() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
      <div className="ticket ticket-notched max-w-2xl -rotate-1 px-8 py-10 sm:px-12">
        <p className="font-sign text-sm text-tent">Error 404</p>
        <h1 className="mt-2 font-sign text-4xl sm:text-5xl">Page not found</h1>
        <p className="mt-4 text-lg text-muted">That booth does not exist in Rhythm Rush.</p>
        <Link
          to="/"
          className="sign mt-8 inline-flex min-h-[44px] items-center bg-tent px-5 py-2 text-base text-cream transition-transform hover:-translate-y-0.5"
        >
          Back to the leaderboard
        </Link>
      </div>
    </section>
  )
}

// Public booth signs. The admin page is deliberately NOT listed here; it is
// reachable by typing /admin only.
const NAV_LINKS = [
  { to: "/", label: "Leaderboard", end: true, tilt: "rotate-1" },
  { to: "/result", label: "Live screen", end: false, tilt: "-rotate-1" },
]

// The active sign is pressed in (no shadow, moved), painted yellow AND gets a
// pointer underneath, so the state is not shown by colour alone.
function navClasses(tilt) {
  return ({ isActive }) =>
    `sign relative inline-flex min-h-[44px] items-center px-3 py-2 text-sm sm:px-4 sm:text-base ${
      isActive
        ? "translate-x-[3px] translate-y-[3px] bg-paint-yellow shadow-none"
        : `${tilt} bg-ticket hover:-translate-y-0.5`
    } transition-transform`
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <header>
        <div className="awning">
          {/* Lower awning from 1024 px, so the Top 10 fits a 1080p screen. */}
          <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-4 px-4 py-5 sm:px-6 lg:py-2">
            <Link
              to="/"
              className="sign -rotate-2 bg-tent-dark px-4 py-2 text-2xl text-cream transition-transform hover:rotate-0 sm:text-3xl lg:py-1.5 lg:text-2xl"
            >
              Rhythm <span className="text-paint-yellow">Rush</span>
            </Link>

            <nav aria-label="Main" className="flex items-center gap-3 sm:gap-4">
              {NAV_LINKS.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end} className={navClasses(link.tilt)}>
                  {({ isActive }) => (
                    <>
                      {link.label}
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="absolute -bottom-[15px] left-1/2 -ml-2 border-x-8 border-t-[10px] border-x-transparent border-t-ink"
                        />
                      ) : null}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
        <MarqueeBulbs />
        <Scallops />
      </header>

      {/* flex column, so the kiosk stage can grow to the bottom of the screen */}
      <main className="flex flex-1 flex-col">
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

      <footer>
        <Bunting />
        <div className="bg-midnight text-cream">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
            <p className="text-base font-extrabold">Animal IQ is just for fun, not a real IQ test.</p>
            <ArcadeButtons size="1.1rem" labelTone="cream" className="scale-90" />
          </div>
        </div>
      </footer>
    </div>
  )
}

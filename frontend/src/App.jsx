// frontend/src/App.jsx
// Shell: the striped awning header, routes, the bunting footer.
// The router itself is in main.jsx. The site opens on the live game (/).

import { Suspense, lazy } from "react"
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom"

import ArcadeButtons from "./components/ArcadeButtons"
import { visitorText } from "./content/visitorText"
import { Bunting, MarqueeBulbs, Scallops } from "./components/Decor"
import { LiveIndicator } from "./components/LiveIndicator"
import { LiveProvider } from "./live/useLiveGame"
import Leaderboard from "./pages/Leaderboard"
import Result from "./pages/Result"

// Loaded lazily: the session page pulls in Recharts and the brochure has its
// print-only code, so the live game and the leaderboard load fast.
const SessionDetail = lazy(() => import("./pages/SessionDetail"))
const HowToPlay = lazy(() => import("./pages/HowToPlay"))

const T = visitorText

function PageLoading() {
  return (
    <div role="status" className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-14 sm:px-6">
      <ArcadeButtons sequence size="2.25rem" />
      <p className="font-sign text-lg">{T.common.loading}</p>
    </div>
  )
}

function NotFound() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
      <div className="ticket ticket-notched max-w-2xl -rotate-1 px-8 py-10 sm:px-12">
        <p className="font-sign text-sm text-tent">{T.notFound.tag}</p>
        <h1 className="mt-2 font-sign text-4xl sm:text-5xl">{T.notFound.title}</h1>
        <p className="mt-4 text-lg text-muted">{T.notFound.text}</p>
        <Link
          to="/live"
          className="sign mt-8 inline-flex min-h-[44px] items-center bg-tent px-5 py-2 text-base text-cream transition-transform hover:-translate-y-0.5"
        >
          {T.common.backToLive}
        </Link>
      </div>
    </section>
  )
}

// Public booth signs. "Live game" is also active on /result (the old name).
const NAV_LINKS = [
  { to: "/live", label: T.nav.live, tilt: "-rotate-1", paths: ["/live", "/result"] },
  { to: "/leaderboard", label: T.nav.leaderboard, tilt: "rotate-1", paths: ["/leaderboard"] },
  { to: "/how-to-play", label: T.nav.howToPlay, tilt: "-rotate-1", paths: ["/how-to-play"] },
]

function isCurrent(link, pathname) {
  return link.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

// The active sign is pressed in (no shadow, moved), painted yellow AND gets a
// pointer underneath, so the state is not shown by colour alone.
function navClasses(tilt, isActive) {
  return `sign relative inline-flex min-h-[44px] items-center px-3 py-2 text-sm sm:px-4 sm:text-base ${
      isActive
        ? "translate-x-[3px] translate-y-[3px] bg-paint-yellow shadow-none"
        : `${tilt} bg-ticket hover:-translate-y-0.5`
    } transition-transform`
}

export default function App() {
  return (
    <LiveProvider>
      <Shell />
    </LiveProvider>
  )
}

export function Shell() {
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        {T.nav.skip}
      </a>
      <header className="site-header">
        <div className="awning">
          {/* Lower awning from 1024 px, so the Top 10 fits a 1080p screen. */}
          <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-4 px-4 py-5 sm:px-6 lg:py-2">
            {/* LIVE keeps its place next to the brand even when hidden, so the
                header never changes height when a game starts. */}
            <div className="flex items-center gap-3">
              <Link
                to="/live"
                className="sign -rotate-2 bg-tent-dark px-4 py-2 text-2xl text-cream transition-transform hover:rotate-0 sm:text-3xl lg:py-1.5 lg:text-2xl"
              >
                Rhythm <span className="text-paint-yellow">Rush</span>
              </Link>
              <LiveIndicator />
            </div>

            <nav aria-label={T.nav.label} className="flex flex-wrap items-center gap-3 sm:gap-4">
              {NAV_LINKS.map((link) => {
                const active = isCurrent(link, pathname)
                return (
                  <Link key={link.to} to={link.to} aria-current={active ? "page" : undefined} className={navClasses(link.tilt, active)}>
                    {link.label}
                    {active ? (
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-[15px] left-1/2 -ml-2 border-x-8 border-t-[10px] border-x-transparent border-t-ink"
                      />
                    ) : null}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
        <MarqueeBulbs />
        <Scallops />
      </header>

      {/* flex column, so the kiosk stage can grow to the bottom of the screen */}
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/live" replace />} />
            <Route path="/live" element={<Result />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/how-to-play" element={<HowToPlay />} />
            <Route path="/result" element={<Result />} />
            <Route path="/result/:sessionId" element={<Result />} />
            <Route path="/session/:id" element={<SessionDetail />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>

      <footer className="site-footer">
        <Bunting />
        <div className="bg-midnight text-cream">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
            <p className="text-base font-extrabold">{T.footer.fun}</p>
            <Link to="/how-to-play" className="footer-help inline-flex min-h-[44px] items-center gap-2 font-extrabold underline">
              <span className="help-sign-dot" aria-hidden="true">
                ?
              </span>
              {T.footer.help}
            </Link>
            <ArcadeButtons size="1.1rem" className="scale-90" />
          </div>
        </div>
      </footer>
    </div>
  )
}

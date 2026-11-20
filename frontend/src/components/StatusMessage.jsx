// frontend/src/components/StatusMessage.jsx
// One component for the three page states: loading, error, empty.
//
// "compact" is used for the inline refresh banner, when old rows are still
// visible underneath.

export default function StatusMessage({
  variant,
  error,
  onRetry,
  compact = false,
  title = "Could not load the leaderboard",
}) {
  if (variant === "loading") {
    return (
      <div className="space-y-3" role="status" aria-label="Loading leaderboard">
        {[0, 1, 2, 3, 4].map((row) => (
          <div
            key={row}
            className="h-16 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
          />
        ))}
      </div>
    )
  }

  if (variant === "error") {
    return (
      <div
        role="alert"
        className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-950/50 ${
          compact ? "mb-4 px-4 py-3" : "px-5 py-4"
        }`}
      >
        <div>
          <p className="font-semibold text-red-200">{title}</p>
          <p className="text-sm text-red-300/80">
            {error?.message || "Unknown error"}
          </p>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-2 font-semibold text-red-100 transition hover:bg-red-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >
            Retry
          </button>
        ) : null}
      </div>
    )
  }

  if (variant === "empty") {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-16 text-center">
        <p className="text-2xl font-bold text-slate-200">
          No games yet.{" "}
          <span className="mt-2 block text-lg font-normal text-slate-400">
            Press Start on the device!
          </span>
        </p>
      </div>
    )
  }

  return null
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext.jsx'
import { useMeetingHistory } from '@/lib/useMeetingHistory.js'
import { dayLabel, formatDuration, formatTime, initialsOf, isInProgress, withWhom } from '@/lib/format.js'

const AVATAR_COLORS = ['#9b8ce8', '#5aa9a3', '#d98b5f', '#c9a24b', '#6fae6a', '#d97aa5', '#6fa3d9']
const colorOf = (name) => {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function Faces({ names, max = 3, size = 'h-8 w-8 text-[11px]' }) {
  if (names.length === 0) {
    return (
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-panel-2 text-muted-ink ${size}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-1/2 w-1/2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </span>
    )
  }
  const shown = names.slice(0, max)
  const extra = names.length - shown.length
  return (
    <span className="flex shrink-0" aria-hidden="true">
      {shown.map((n, i) => (
        <span
          key={n}
          className={`flex items-center justify-center rounded-full border-2 border-panel font-display font-semibold ${size} ${i ? '-ml-2.5' : ''}`}
          style={{ background: `${colorOf(n)}2e`, color: colorOf(n) }}
        >
          {initialsOf(n)}
        </span>
      ))}
      {extra > 0 && (
        <span className={`-ml-2.5 flex items-center justify-center rounded-full border-2 border-panel bg-panel-2 font-semibold text-muted-ink ${size}`}>
          +{extra}
        </span>
      )}
    </span>
  )
}

function MeetingRow({ m, onRejoin, onDelete }) {
  const live = isInProgress(m)
  const duration = formatDuration(m.joinedAt, m.endedAt)
  const untitled = m.title === m.code

  return (
    <li className="group flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 transition hover:border-[#3a3f52] sm:flex-row sm:items-center sm:p-5">
      <Faces names={m.participants} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`truncate text-[15.5px] font-semibold text-ink ${untitled ? 'font-mono tracking-[0.04em]' : 'font-display'}`}>
            {m.title}
          </h3>
          {m.isHost && (
            <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-semibold text-amber">Host</span>
          )}
          {live && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-400/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Live
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-ink">
          {!untitled && <span className="font-mono text-[12.5px] tracking-[0.04em]">{m.code}</span>}
          {!untitled && <span aria-hidden="true">·</span>}
          <span>{formatTime(m.joinedAt)}</span>
          {duration && (
            <>
              <span aria-hidden="true">·</span>
              <span>{duration}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="truncate">{withWhom(m.participants)}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => onRejoin(m.code)}
          className="flex-1 rounded-[11px] border border-line px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-amber hover:text-amber sm:flex-none"
        >
          {live ? 'Rejoin' : 'Start again'}
        </button>
        <button
          onClick={() => onDelete(m.id)}
          title="Remove from history"
          aria-label={`Remove ${m.title} from history`}
          className="flex h-9 w-9 items-center justify-center rounded-[11px] text-muted-ink transition hover:bg-panel-2 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
          </svg>
        </button>
      </div>
    </li>
  )
}

export default function History() {
  const navigate = useNavigate()
  const { isLoggedIn } = useAuth()
  const { meetings, loading, error, reload, remove, clearAll } = useMeetingHistory(100)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    if (!isLoggedIn) navigate('/login', { replace: true })
  }, [isLoggedIn, navigate])

  // group by day, newest first (the API already sorts by date)
  const groups = useMemo(() => {
    const out = []
    for (const m of meetings) {
      const label = dayLabel(m.joinedAt)
      if (out.at(-1)?.label !== label) out.push({ label, items: [] })
      out.at(-1).items.push(m)
    }
    return out
  }, [meetings])

  const totalMinutes = useMemo(
    () => Math.round(meetings.reduce((sum, m) => sum + (m.endedAt ? new Date(m.endedAt) - new Date(m.joinedAt) : 0), 0) / 60000),
    [meetings]
  )

  // the code is passed along so the join screen is filled in
  const rejoin = (code) => navigate('/join', { state: { code } })

  return (
    <div className="mx-auto w-full max-w-[880px] px-6 pb-16 pt-4 sm:px-12">
      <button onClick={() => navigate('/')} className="mb-5 text-[13px] text-muted-ink hover:text-ink">
        ← Back
      </button>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Meeting history</h1>
          {!loading && meetings.length > 0 && (
            <p className="mt-2 text-[14px] text-muted-ink">
              {meetings.length} {meetings.length === 1 ? 'meeting' : 'meetings'}
              {totalMinutes > 0 && ` · ${totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)} hr ${totalMinutes % 60} min` : `${totalMinutes} min`} in calls`}
            </p>
          )}
        </div>

        {meetings.length > 0 &&
          (confirmClear ? (
            <div className="flex items-center gap-2 text-[13px]">
              <span className="text-muted-ink">Clear all history?</span>
              <button onClick={() => setConfirmClear(false)} className="rounded-[11px] border border-line px-3 py-1.5 font-semibold text-ink hover:bg-panel-2">
                Cancel
              </button>
              <button
                onClick={async () => {
                  await clearAll()
                  setConfirmClear(false)
                }}
                className="rounded-[11px] bg-red-400/90 px-3 py-1.5 font-semibold text-[#2a0f0b] hover:bg-red-400"
              >
                Clear
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)} className="text-[13px] text-muted-ink hover:text-red-400">
              Clear history
            </button>
          ))}
      </div>

      {loading ? (
        <ul className="space-y-3" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-[84px] animate-pulse rounded-2xl border border-line bg-panel" />
          ))}
        </ul>
      ) : error ? (
        <div className="rounded-2xl border border-line bg-panel p-8 text-center">
          <p className="text-[14px] text-red-400">{error}</p>
          <button onClick={reload} className="mt-4 rounded-[11px] border border-line px-4 py-2 text-[13px] font-semibold text-ink hover:bg-panel-2">
            Try again
          </button>
        </div>
      ) : meetings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <h2 className="font-display text-xl font-semibold text-ink">No meetings yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted-ink">
            Calls you start or join will show up here, with who was there and how long it lasted.
          </p>
          <button
            onClick={() => navigate('/new')}
            className="mt-6 rounded-[11px] bg-amber px-5 py-2.5 text-[14px] font-semibold text-amber-ink hover:bg-amber/90"
          >
            Start a meeting
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-ink">{g.label}</h2>
              <ul className="space-y-2.5">
                {g.items.map((m) => (
                  <MeetingRow key={m.id} m={m} onRejoin={rejoin} onDelete={remove} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

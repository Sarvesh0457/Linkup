// Formatting helpers for meeting history.

export function initialsOf(name = '') {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?'
  )
}

// "45 sec", "12 min", "1 hr 5 min"
export function formatDuration(start, end) {
  if (!start || !end) return null
  const secs = Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000))
  if (secs < 60) return `${secs} sec`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

export function formatTime(date) {
  return new Date(date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

// "Today", "Yesterday", "Monday", or "12 Nov 2026"
export function dayLabel(date) {
  const d = new Date(date)
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// short relative label for compact lists: "Just now", "2 hr ago", "Yesterday", "3 days ago"
export function relativeLabel(date) {
  const mins = Math.round((Date.now() - new Date(date)) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// no end time: still in the call, or the server stopped mid-call (only "live" if it's recent)
export function isInProgress(m) {
  return !m.endedAt && Date.now() - new Date(m.joinedAt) < 6 * 3600 * 1000
}

export function withWhom(participants = []) {
  if (participants.length === 0) return 'Just you'
  if (participants.length <= 2) return `With ${participants.join(' and ')}`
  return `With ${participants.slice(0, 2).join(', ')} +${participants.length - 2}`
}

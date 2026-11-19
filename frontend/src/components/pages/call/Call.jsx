import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '@/context/AuthContext.jsx'
import { api, SOCKET_URL } from '@/lib/api.js'

// STUN finds your public address; TURN relays media when a direct path is blocked (strict office,
// school or mobile networks). Set VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL to add one.
const TURN = import.meta.env.VITE_TURN_URL
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    ...(TURN
      ? [{ urls: TURN.split(',').map((u) => u.trim()), username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL }]
      : []),
  ],
}
const DEFAULT_PEER = { name: 'Guest', mic: true, cam: true, hand: false, sharing: false }
const COLORS = ['#9b8ce8', '#5aa9a3', '#d98b5f', '#c9a24b', '#6fae6a', '#d97aa5', '#6fa3d9']
const EMOJIS = ['👍', '❤️', '😂', '🎉', '👏', '🙌']
const CONNECT_MSGS = [
  'Linking up your crew…',
  'Untangling the cables…',
  'Waking up the mics…',
  'Politely asking Wi-Fi for a favor…',
  'Snapping everyone into place…',
]
const CHIPS = [['RM', 98, 0], ['JK', 49, 85], ['SA', -49, 85], ['DP', -98, 0], ['LT', -49, -85], ['You', 49, -85]]
const STATS_EVERY_MS = 2000
const TYPING_IDLE_MS = 2500
const TYPING_HEARTBEAT_MS = 2000

const CSS = `
@keyframes lu-chip{0%{opacity:0;transform:translate(var(--sx),var(--sy)) scale(.4)}100%{opacity:1;transform:translate(var(--fx),var(--fy)) scale(1)}}
@keyframes lu-ring{0%{transform:scale(.7);opacity:.55}100%{transform:scale(1.6);opacity:0}}
@keyframes lu-bar{0%,100%{transform:scaleY(.55)}50%{transform:scaleY(1)}}
@keyframes lu-float{0%{opacity:0;transform:translateY(0) scale(.7)}15%{opacity:1;transform:translateY(-10px) scale(1)}100%{opacity:0;transform:translateY(-140px) scale(1.1)}}
@keyframes lu-dot{0%,80%,100%{opacity:.25}40%{opacity:1}}
`

/* ---------- helpers ---------- */
const initialsOf = (name) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'U'

const colorOf = (id) => {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

const fmtClock = (s) => {
  const h = Math.floor(s / 3600)
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${m}:${sec}` : `${m}:${sec}`
}

const sdpOf = (pc) => ({ type: pc.localDescription.type, sdp: pc.localDescription.sdp })

async function getLocalMedia() {
  for (const c of [{ video: true, audio: true }, { video: false, audio: true }, { video: true, audio: false }]) {
    try {
      return await navigator.mediaDevices.getUserMedia(c)
    } catch {
      /* try next combination */
    }
  }
  return new MediaStream()
}

// placeholder so every user always has a video sender (needed for screen share without a camera)
function blankVideoTrack() {
  const c = Object.assign(document.createElement('canvas'), { width: 16, height: 16 })
  c.getContext('2d').fillRect(0, 0, 16, 16)
  const t = c.captureStream(1).getVideoTracks()[0]
  t.enabled = false
  return t
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const h = () => setNarrow(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return narrow
}

/*
 * Connection quality from WebRTC's own statistics (RTCPeerConnection.getStats):
 *  - round-trip time of the active candidate pair (how long a packet takes there and back)
 *  - packet loss on incoming audio/video since the last check
 *  - candidate types: "host" = same network, "srflx"/"prflx" = direct via STUN, "relay" = via TURN
 */
async function readQuality(pc, prev = {}) {
  const report = await pc.getStats()
  let pair
  let lost = 0
  let received = 0
  const byId = new Map()
  report.forEach((s) => {
    byId.set(s.id, s)
    if (s.type === 'transport' && s.selectedCandidatePairId) pair = s.selectedCandidatePairId
    if (s.type === 'inbound-rtp') {
      lost += s.packetsLost || 0
      received += s.packetsReceived || 0
    }
  })
  let active = pair && byId.get(pair)
  if (!active) report.forEach((s) => s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && (active = s))
  if (!active) return { level: 0, lost, received }

  const rtt = active.currentRoundTripTime != null ? Math.round(active.currentRoundTripTime * 1000) : null
  const dLost = Math.max(0, lost - (prev.lost ?? lost))
  const dRecv = Math.max(0, received - (prev.received ?? received))
  const loss = dLost + dRecv > 0 ? (dLost / (dLost + dRecv)) * 100 : 0

  const types = [byId.get(active.localCandidateId)?.candidateType, byId.get(active.remoteCandidateId)?.candidateType]
  const path = types.includes('relay')
    ? 'Relayed through a TURN server'
    : types.every((t) => t === 'host')
      ? 'Direct (same local network)'
      : 'Direct peer-to-peer (found via STUN)'

  const level = rtt == null ? 0 : rtt < 150 && loss < 2 ? 3 : rtt < 300 && loss < 6 ? 2 : 1
  return { level, rtt, loss, path, lost, received }
}

/* ---------- small components ---------- */
const ICONS = {
  mic: (<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v4" /></>),
  cam: (<><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M22 8l-6 4 6 4V8z" /></>),
  hand: <path d="M8 13V6a2 2 0 0 1 4 0v5M12 11V4a2 2 0 0 1 4 0v7M16 12V6a2 2 0 0 1 4 0v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4.3 12A1.8 1.8 0 0 1 7 9.7L8 11" />,
  smile: (<><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></>),
  screen: (<><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>),
  people: (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  chat: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
  leave: <path d="M4 15v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2M2 15l4-1v4l-4-1v-2zM22 15l-4-1v4l4-1v-2z" />,
  copy: (<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>),
  speaker: (<><rect x="3" y="3" width="18" height="11" rx="1.5" /><rect x="3" y="17" width="5" height="4" rx="1" /><rect x="9.5" y="17" width="5" height="4" rx="1" /><rect x="16" y="17" width="5" height="4" rx="1" /></>),
  pin: <path d="M12 2v7l4 4v2h-4v6M12 2v7l-4 4v2h4" />,
  lock: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  crown: <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" />,
  remove: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M17 8l5 5M22 8l-5 5" /></>),
}

function Icon({ name, off, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      {ICONS[name]}
      {off && <path d="M3 3l18 18" />}
    </svg>
  )
}

const TONES = {
  plain: 'bg-[#191c26] text-[#e9ebf3]',
  light: 'bg-[#e9ebf3] text-[#12141c]',
  amber: 'border-[#f0a23e] bg-[#f0a23e] text-[#2a1707]',
  red: 'bg-[#191c26] text-[#e2604f]',
}

function Ctrl({ icon, off, tone = 'plain', title, onClick, disabled, badge }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`relative flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-[#2a2e3d] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${TONES[tone]}`}
    >
      <Icon name={icon} off={off} />
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#f0a23e] px-1 text-[10px] font-bold text-[#2a1707]">
          {badge}
        </span>
      )}
    </button>
  )
}

function RemoteAudio({ stream }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return <audio ref={ref} autoPlay />
}

// three signal bars; hover for the numbers behind them
const QUALITY = {
  3: ['Good connection', '#6fae6a'],
  2: ['Fair connection', '#f0a23e'],
  1: ['Poor connection', '#e2604f'],
  0: ['Connecting…', '#8c91a6'],
}
function QualityBars({ q }) {
  if (!q) return null
  const [label, color] = QUALITY[q.level]
  const detail = q.level
    ? `${label}\nRound trip: ${q.rtt} ms\nPacket loss: ${q.loss.toFixed(1)}%\n${q.path}`
    : label
  return (
    <span title={detail} aria-label={label} className="flex h-6 items-end gap-[2px] rounded-md bg-[#0a0b10]/45 px-1.5 pb-[5px] pt-[5px]">
      {[5, 9, 13].map((h, i) => (
        <span key={h} className="w-[3px] rounded-[1px]" style={{ height: h, background: i < q.level ? color : '#ffffff33' }} />
      ))}
    </span>
  )
}

function Tile({ p, stream, size = 'md', mirror, contain, pinned, onClick, quality }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null
  }, [stream])

  // only show video once a video track has actually arrived; until then (or if the connection
  // never gets through, e.g. a strict network without TURN) show the person's initials
  const showVideo = !!stream && stream.getVideoTracks().length > 0 && (p.sharing || p.cam)
  const avatar = { lg: 'h-[78px] w-[78px] text-2xl', md: 'h-14 w-14 text-lg', sm: 'h-[38px] w-[38px] text-[13px]' }[size]

  return (
    <div
      onClick={onClick}
      className="relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-[14px]"
      style={{ background: `linear-gradient(150deg, ${p.color}38, #26293a)` }}
    >
      {/* video elements are always muted; remote audio plays through <RemoteAudio/> */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full ${contain ? 'bg-black object-contain' : 'object-cover'} ${mirror ? '-scale-x-100' : ''} ${showVideo ? '' : 'hidden'}`}
      />
      {!showVideo && (
        <div
          className={`flex items-center justify-center rounded-full font-display font-semibold ${avatar}`}
          style={{ background: `${p.color}2e`, color: p.color }}
        >
          {initialsOf(p.name)}
        </div>
      )}

      {pinned && <div className="pointer-events-none absolute inset-0 rounded-[14px] ring-2 ring-inset ring-[#f0a23e]" />}
      {!p.mic && (
        <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-[7px] bg-[#e2604f]/20 text-[#e2604f]">
          <Icon name="mic" off className="h-[13px] w-[13px]" />
        </div>
      )}
      {p.hand && <div className="absolute right-2 top-2 text-base">🖐️</div>}
      {p.sharing && size !== 'sm' && (
        <div className="absolute left-3.5 top-3.5 rounded-lg bg-[#e2604f]/20 px-2.5 py-1 text-[11px] font-bold tracking-wide text-[#e2604f]">
          🖥️ PRESENTING
        </div>
      )}
      <div className="absolute bottom-2.5 left-2.5 flex max-w-[75%] items-center gap-1.5 truncate rounded-lg bg-[#0a0b10]/45 px-[9px] py-1 text-[12.5px] font-medium text-[#e9ebf3]">
        {p.host && <Icon name="crown" className="h-3 w-3 shrink-0 text-[#f0a23e]" />}
        <span className="truncate">{p.isYou ? 'You' : p.name}</span>
      </div>
      {quality && size !== 'sm' && (
        <div className="absolute bottom-2.5 right-2.5">
          <QualityBars q={quality} />
        </div>
      )}
    </div>
  )
}

// one chat bubble, with emoji reactions underneath
function ChatMessage({ m, onReact, grouped }) {
  const [picking, setPicking] = useState(false)
  return (
    <div className={`group flex max-w-[88%] flex-col gap-[3px] ${m.mine ? 'items-end self-end' : ''} ${grouped ? '-mt-1.5' : ''}`}>
      {!grouped && <div className="px-0.5 text-[11px] text-[#8c91a6]">{m.mine ? 'You' : m.sender}</div>}
      <div className={`relative flex items-center gap-1 ${m.mine ? 'flex-row-reverse' : ''}`}>
        <div
          className={`break-words rounded-xl px-[11px] py-2 text-[13px] leading-snug ${
            m.mine ? 'rounded-tr-[4px] bg-[#f0a23e] text-[#2a1707]' : 'rounded-tl-[4px] bg-[#1f2330]'
          }`}
        >
          {m.text}
        </div>
        {m.id && (
          <button
            onClick={() => setPicking((v) => !v)}
            aria-label="React to this message"
            title="React"
            className={`shrink-0 rounded-full p-1 text-[#8c91a6] transition hover:bg-[#1f2330] hover:text-[#e9ebf3] ${
              picking ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-60'
            }`}
          >
            <Icon name="smile" className="h-3.5 w-3.5" />
          </button>
        )}
        {picking && (
          <div
            className={`absolute -top-10 z-20 flex gap-0.5 rounded-full border border-[#2a2e3d] bg-[#191c26] px-1.5 py-1 shadow-[0_10px_30px_-10px_rgba(0,0,0,.6)] ${
              m.mine ? 'right-0' : 'left-0'
            }`}
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  onReact(m.id, e)
                  setPicking(false)
                }}
                className="rounded-full p-1 text-base leading-none transition hover:scale-125 hover:bg-[#1f2330]"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      {m.reactions?.length > 0 && (
        <div className={`flex flex-wrap gap-1 ${m.mine ? 'justify-end' : ''}`}>
          {m.reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => onReact(m.id, r.emoji)}
              title={r.names.join(', ')}
              className={`flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[12px] transition ${
                r.mine ? 'border-[#f0a23e]/60 bg-[#f0a23e]/15 text-[#e9ebf3]' : 'border-[#2a2e3d] bg-[#1f2330] text-[#8c91a6] hover:text-[#e9ebf3]'
              }`}
            >
              <span>{r.emoji}</span>
              <span className="tabular-nums">{r.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function typingLine(names) {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} is typing`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`
  return 'Several people are typing'
}

/* ---------- page ---------- */
export default function Call() {
  const { code } = useParams()
  const { state: lobby } = useLocation()
  const navigate = useNavigate()
  const { user, isLoggedIn, sessionExpired } = useAuth()
  const userName = user?.name || 'Guest'

  const socketRef = useRef(null)
  const pcsRef = useRef({}) // peerId -> { pc, stream, pending, stats }
  const localStreamRef = useRef(null)
  const camTrackRef = useRef(null)
  const screenRef = useRef(null)
  const meRef = useRef({ mic: true, cam: true, hand: false, sharing: false })
  const peersRef = useRef({})
  const panelRef = useRef(null)
  const offsetRef = useRef(0)
  const joinedRef = useRef(false)
  const joinedAtRef = useRef(Date.now())
  const toastTimer = useRef(null)
  const chatEndRef = useRef(null)
  const expiredRef = useRef(false)
  const hostIdRef = useRef(null)
  const typingTimers = useRef({})
  const myTypingRef = useRef({ on: false, timer: null })
  const waitingCountRef = useRef(0)

  const [localStream, setLocalStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [avail, setAvail] = useState({ mic: true, cam: true })
  const [me, setMe] = useState(meRef.current)
  const [peers, setPeers] = useState({})
  const [room, setRoom] = useState(null)
  const [joined, setJoined] = useState(false)
  const [minDone, setMinDone] = useState(false)
  const [error, setError] = useState('')
  const [msgIdx, setMsgIdx] = useState(0)
  const [view, setView] = useState('grid')
  const [pinnedId, setPinnedId] = useState(null)
  const [panel, setPanel] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [unread, setUnread] = useState(0)
  const [showReactions, setShowReactions] = useState(false)
  const [floaters, setFloaters] = useState([])
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [toast, setToast] = useState('')
  const [hostId, setHostId] = useState(null)
  const [myId, setMyId] = useState(null)
  const [waitingRoomOn, setWaitingRoomOn] = useState(false)
  const [waitingList, setWaitingList] = useState([])
  const [status, setStatus] = useState('connecting') // connecting | waiting | in | denied
  const [deniedReason, setDeniedReason] = useState('')
  const [typing, setTyping] = useState({}) // socketId -> name
  const [quality, setQuality] = useState({}) // socketId -> { level, rtt, loss, path }
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [, setTick] = useState(0)
  const [, setRev] = useState(0)
  const narrow = useNarrow()

  panelRef.current = panel
  peersRef.current = peers
  hostIdRef.current = hostId

  const notify = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  const updateMe = (patch) => {
    meRef.current = { ...meRef.current, ...patch }
    setMe(meRef.current)
    socketRef.current?.emit('peer-state', patch)
  }

  // leave the call page with a message for the home screen
  const exitWith = (message) => navigate('/', { replace: true, state: { left: message } })

  // direct link / refresh: no lobby state, so send them through Setup (prefilled with the code)
  useEffect(() => {
    if (!isLoggedIn) navigate('/login', { replace: true, state: { next: '/join', code } })
    else if (!lobby) navigate('/join', { replace: true, state: { code } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- media + socket + WebRTC ---- */
  useEffect(() => {
    if (!isLoggedIn || !lobby) return
    let cancelled = false
    const typingTimersMap = typingTimers.current // same object for the whole call
    const myTyping = myTypingRef.current

    const dropPeer = (id) => {
      pcsRef.current[id]?.pc.close()
      delete pcsRef.current[id]
      setPeers((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setQuality((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setPinnedId((p) => (p === id ? null : p))
    }

    const ensurePeer = (id, info) => {
      setPeers((prev) => ({ ...prev, [id]: { ...DEFAULT_PEER, ...prev[id], ...info } }))
      if (pcsRef.current[id]) return pcsRef.current[id]

      const pc = new RTCPeerConnection(RTC_CONFIG)
      const entry = { pc, stream: new MediaStream(), pending: [], stats: {} }
      pcsRef.current[id] = entry

      pc.onicecandidate = (e) => e.candidate && socketRef.current?.emit('signal', id, { ice: e.candidate.toJSON() })
      pc.ontrack = (e) => {
        // new stream object each time so <video> re-attaches and starts playing
        entry.stream = new MediaStream([...entry.stream.getTracks(), e.track])
        setRev((n) => n + 1)
      }

      const local = localStreamRef.current
      const video = screenRef.current?.getVideoTracks()[0] || camTrackRef.current
      ;[...local.getAudioTracks(), video].filter(Boolean).forEach((t) => pc.addTrack(t, local))
      return entry
    }

    const makeOffer = async (id) => {
      const { pc } = pcsRef.current[id]
      if (!pc.getSenders().some((s) => s.track?.kind === 'audio')) pc.addTransceiver('audio', { direction: 'recvonly' })
      await pc.setLocalDescription(await pc.createOffer())
      socketRef.current?.emit('signal', id, { sdp: sdpOf(pc) })
    }

    const handleSignal = async (fromId, message) => {
      const { pc, pending } = ensurePeer(fromId)
      try {
        if (message.sdp) {
          await pc.setRemoteDescription(message.sdp)
          while (pending.length) await pc.addIceCandidate(pending.shift())
          if (message.sdp.type === 'offer') {
            await pc.setLocalDescription(await pc.createAnswer())
            socketRef.current?.emit('signal', fromId, { sdp: sdpOf(pc) })
          }
        } else if (message.ice) {
          if (pc.remoteDescription) await pc.addIceCandidate(message.ice)
          else pending.push(message.ice)
        }
      } catch (err) {
        console.error('signal error', err)
      }
    }

    const start = async () => {
      const stream = await getLocalMedia()
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      const hasMic = stream.getAudioTracks().length > 0
      const hasCam = stream.getVideoTracks().length > 0
      if (!hasCam) stream.addTrack(blankVideoTrack())
      stream.getAudioTracks().forEach((t) => (t.enabled = lobby.mic))
      stream.getVideoTracks().forEach((t) => (t.enabled = hasCam && lobby.cam))

      localStreamRef.current = stream
      camTrackRef.current = stream.getVideoTracks()[0]
      meRef.current = { ...meRef.current, mic: hasMic && lobby.mic, cam: hasCam && lobby.cam }
      setMe(meRef.current)
      setAvail({ mic: hasMic, cam: hasCam })
      setLocalStream(stream)

      // Each connection attempt fetches a fresh one-time ticket through the cookie-authenticated
      // API (the socket can't carry the httpOnly cookie across sites). Reconnects get a new one too.
      const socket = io(SOCKET_URL, {
        auth: (cb) => {
          api('/auth/socket-ticket', { method: 'POST' })
            .then((d) => cb({ ticket: d.ticket }))
            .catch((err) => {
              if (err.status === 401) expiredRef.current = true
              cb({ ticket: null })
            })
        },
      })
      socketRef.current = socket

      socket.on('connect', () => {
        Object.keys(pcsRef.current).forEach(dropPeer) // reconnects start clean
        setPeers({})
        setMessages([])
        setTyping({})
        setError('')
        setMyId(socket.id)
        socket.emit('join-call', code, { title: lobby.title, waitingRoom: !!lobby.waitingRoom, ...meRef.current })
      })
      socket.on('connect_error', (err) => {
        if (err?.message === 'unauthorized' && expiredRef.current) {
          // session ended: log in again, then come straight back to this call
          socket.disconnect()
          sessionExpired()
          navigate('/login', { replace: true, state: { next: '/join', code } })
          return
        }
        if (!joinedRef.current) setError("Can't reach the LinkUp server. Is the backend running?")
      })

      // waiting room
      socket.on('waiting', () => setStatus('waiting'))
      socket.on('join-denied', (reason) => {
        setDeniedReason(reason)
        setStatus('denied')
      })

      socket.on('room-info', (info) => {
        offsetRef.current = info.serverNow - Date.now()
        if (!joinedRef.current) joinedAtRef.current = Date.now()
        joinedRef.current = true
        setRoom({ title: info.title, startedAt: info.startedAt })
        setHostId(info.hostId)
        setWaitingRoomOn(!!info.waitingRoom)
        setStatus('in')
        setJoined(true)
      })
      socket.on('host-changed', (id) => {
        setHostId(id)
        if (id === socket.id) notify("You're now the host")
      })
      socket.on('room-settings', (s) => {
        setWaitingRoomOn(!!s.waitingRoom)
        notify(s.waitingRoom ? 'Waiting room turned on' : 'Waiting room turned off')
      })
      socket.on('waiting-list', (list) => {
        if (list.length > waitingCountRef.current) {
          const newest = list[list.length - 1]
          notify(`${newest.name} wants to join`)
        }
        waitingCountRef.current = list.length
        setWaitingList(list)
      })

      // host actions aimed at me
      socket.on('force-mute', (by) => {
        const t = localStreamRef.current?.getAudioTracks()[0]
        if (t && meRef.current.mic) {
          t.enabled = false
          updateMe({ mic: false })
        }
        notify(`${by} muted you`)
      })
      socket.on('removed', (by) => exitWith(`${by} removed you from the meeting`))
      socket.on('meeting-ended', (by) =>
        exitWith(hostIdRef.current === socket.id ? 'You ended the meeting for everyone' : `${by} ended the meeting`)
      )

      socket.on('user-joined', (joinerId, clients, infoMap) => {
        const others = clients.filter((id) => id !== socket.id)
        others.forEach((id) => ensurePeer(id, infoMap[id]))
        if (joinerId === socket.id) others.forEach(makeOffer) // the newcomer starts every connection
        else notify(`${infoMap[joinerId]?.name || 'Someone'} joined`)
      })
      socket.on('user-left', (id) => {
        notify(`${peersRef.current[id]?.name || 'Someone'} left`)
        setTyping((t) => {
          const next = { ...t }
          delete next[id]
          return next
        })
        dropPeer(id)
      })
      socket.on('signal', handleSignal)
      socket.on('peer-state', (id, patch) =>
        setPeers((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev))
      )

      // chat
      socket.on('chat-message', (text, sender, fromId, meta = {}) => {
        setMessages((m) => [
          ...m,
          { id: meta.id, text, sender, fromId, mine: fromId === socket.id, reactions: meta.reactions || [] },
        ])
        if (fromId !== socket.id && panelRef.current !== 'chat') setUnread((n) => n + 1)
        setTyping((t) => {
          if (!t[fromId]) return t
          const next = { ...t }
          delete next[fromId]
          return next
        })
      })
      socket.on('chat-reactions', (msgId, reactions) =>
        setMessages((list) => list.map((m) => (m.id === msgId ? { ...m, reactions } : m)))
      )
      socket.on('typing', (id, name, on) => {
        clearTimeout(typingTimers.current[id])
        setTyping((t) => {
          const next = { ...t }
          if (on) next[id] = name
          else delete next[id]
          return next
        })
        // in case the "stopped typing" message never arrives
        if (on)
          typingTimers.current[id] = setTimeout(
            () =>
              setTyping((t) => {
                const next = { ...t }
                delete next[id]
                return next
              }),
            TYPING_IDLE_MS * 2
          )
      })

      socket.on('reaction', (_id, emoji) => {
        const f = { id: Math.random(), emoji, left: 40 + Math.random() * 20 }
        setFloaters((l) => [...l, f])
        setTimeout(() => setFloaters((l) => l.filter((x) => x.id !== f.id)), 1600)
      })
    }

    start().catch((err) => console.error(err))

    return () => {
      cancelled = true
      socketRef.current?.disconnect()
      socketRef.current = null
      Object.values(pcsRef.current).forEach(({ pc }) => pc.close())
      pcsRef.current = {}
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenRef.current?.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
      screenRef.current = null
      joinedRef.current = false
      Object.values(typingTimersMap).forEach(clearTimeout)
      clearTimeout(myTyping.timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- small effects ---- */
  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), 1700) // let the connecting animation play
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (joined && minDone) return
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % CONNECT_MSGS.length), 700)
    return () => clearInterval(t)
  }, [joined, minDone])
  useEffect(() => {
    const h = (e) => {
      if (e.key !== 'Escape') return
      setConfirmLeave(false)
      setConfirmRemove(null)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, panel])

  // connection quality for every remote person, every couple of seconds
  useEffect(() => {
    if (!joined) return
    let alive = true
    const t = setInterval(async () => {
      const next = {}
      await Promise.all(
        Object.entries(pcsRef.current).map(async ([id, entry]) => {
          try {
            const q = await readQuality(entry.pc, entry.stats)
            entry.stats = { lost: q.lost, received: q.received }
            next[id] = q
          } catch {
            /* connection closing */
          }
        })
      )
      if (alive) setQuality(next)
    }, STATS_EVERY_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [joined])

  /* ---- actions ---- */
  const toggleMic = () => {
    const t = localStreamRef.current?.getAudioTracks()[0]
    if (!t) return
    t.enabled = !meRef.current.mic
    updateMe({ mic: t.enabled })
  }
  const toggleCam = () => {
    const t = camTrackRef.current
    if (!t || !avail.cam) return
    t.enabled = !meRef.current.cam
    updateMe({ cam: t.enabled })
  }
  const swapVideoTrack = (track) =>
    Object.values(pcsRef.current).forEach(({ pc }) =>
      pc.getSenders().find((s) => s.track?.kind === 'video')?.replaceTrack(track)
    )
  const stopShare = () => {
    screenRef.current?.getTracks().forEach((t) => t.stop())
    screenRef.current = null
    setScreenStream(null)
    swapVideoTrack(camTrackRef.current)
    updateMe({ sharing: false })
  }
  const startShare = async () => {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const track = s.getVideoTracks()[0]
      track.onended = stopShare // browser's own "Stop sharing" button
      screenRef.current = s
      setScreenStream(s)
      swapVideoTrack(track)
      updateMe({ sharing: true })
    } catch {
      /* user cancelled the picker */
    }
  }
  const sendReaction = (emoji) => {
    socketRef.current?.emit('reaction', emoji)
    setShowReactions(false)
  }
  const setMyTyping = (on) => {
    const me = myTypingRef.current
    // while typing, repeat "on" every couple of seconds so the others' safety timeout
    // doesn't hide the indicator in the middle of a long message
    const heartbeatDue = on && Date.now() - (me.sentAt || 0) > TYPING_HEARTBEAT_MS
    if (me.on === on && !heartbeatDue) return
    me.on = on
    me.sentAt = on ? Date.now() : 0
    socketRef.current?.emit('typing', on)
  }
  const onDraftChange = (value) => {
    setDraft(value)
    setMyTyping(value.trim().length > 0)
    clearTimeout(myTypingRef.current.timer)
    if (value.trim()) myTypingRef.current.timer = setTimeout(() => setMyTyping(false), TYPING_IDLE_MS)
  }
  const sendChat = () => {
    const text = draft.trim()
    if (!text) return
    socketRef.current?.emit('chat-message', text) // server echoes it back to everyone, including us
    setDraft('')
    clearTimeout(myTypingRef.current.timer)
    setMyTyping(false)
  }
  const reactToMessage = (msgId, emoji) => socketRef.current?.emit('chat-react', msgId, emoji)
  const openPanel = (name) => {
    setPanel((p) => (p === name ? null : name))
    if (name === 'chat') setUnread(0)
  }
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* clipboard blocked */
    }
    notify('Meeting code copied')
  }
  const leave = () => {
    const mins = Math.round((Date.now() - joinedAtRef.current) / 60000)
    const spent = mins < 1 ? 'less than a minute' : `${mins} min`
    navigate('/', { state: { left: `You left the meeting · you were in for ${spent}` } })
  }

  // host controls
  const host = {
    admit: (id) => socketRef.current?.emit('host:admit', id),
    deny: (id) => socketRef.current?.emit('host:deny', id),
    mute: (id) => socketRef.current?.emit('host:mute', id),
    remove: (id) => {
      socketRef.current?.emit('host:remove', id)
      setConfirmRemove(null)
    },
    end: () => socketRef.current?.emit('host:end'),
    setWaitingRoom: (on) => socketRef.current?.emit('host:waiting-room', on),
  }

  /* ---- derived ---- */
  const amHost = !!myId && hostId === myId
  const participants = useMemo(
    () => [
      { id: 'you', isYou: true, name: userName, color: '#f0a23e', ...me, host: !!myId && hostId === myId },
      ...Object.entries(peers).map(([id, p]) => ({ id, ...p, color: colorOf(id), host: id === hostId })),
    ],
    [peers, me, userName, hostId, myId]
  )
  const streamOf = (p) => (p.isYou ? screenStream || localStream : pcsRef.current[p.id]?.stream)
  const elapsed = room ? Math.max(0, Math.floor((Date.now() + offsetRef.current - room.startedAt) / 1000)) : 0
  const typingNames = Object.values(typing)

  if (!isLoggedIn || !lobby) return null

  /* ---- not let in: denied, removed, or the meeting ended while waiting ---- */
  if (status === 'denied') {
    const text = {
      denied: ["The host didn't let you in", 'You can ask them to let you in and try again.'],
      removed: ['You were removed from this meeting', "The host removed you, so you can't rejoin this meeting."],
      ended: ['The meeting has ended', 'Everyone has left, or the host ended the meeting.'],
    }[deniedReason] || ["Couldn't join", 'Please try again.']
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-[#12141c] px-6 text-center font-sans text-[#e9ebf3]">
        <h2 className="mb-2 font-display text-xl font-semibold">{text[0]}</h2>
        <p className="mb-6 max-w-[340px] text-sm text-[#8c91a6]">{text[1]}</p>
        <button
          onClick={() => navigate('/')}
          className="rounded-[11px] border border-[#2a2e3d] px-[22px] py-3 text-[14.5px] font-semibold hover:bg-[#1f2330]"
        >
          Back to home
        </button>
      </div>
    )
  }

  /* ---- waiting room (guest side) ---- */
  if (status === 'waiting') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-[#12141c] px-6 text-center font-sans text-[#e9ebf3]">
        <style>{CSS}</style>
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-[#2a2e3d] bg-[#191c26] text-[#f0a23e]">
          <Icon name="lock" className="h-7 w-7" />
        </div>
        <h2 className="mb-2 font-display text-xl font-semibold">Waiting for the host to let you in</h2>
        <p className="max-w-[340px] text-sm text-[#8c91a6]">
          {lobby.title ? `${lobby.title} · ` : ''}
          <span className="font-mono">{code}</span>
        </p>
        <p className="mb-8 mt-1 flex items-center gap-1 text-[13px] text-[#8c91a6]" aria-live="polite">
          They've been told you're here
          {[0, 0.2, 0.4].map((d) => (
            <span key={d} style={{ animation: `lu-dot 1.2s ${d}s infinite` }}>.</span>
          ))}
        </p>
        <button
          onClick={() => navigate('/')}
          className="rounded-[11px] border border-[#2a2e3d] px-[22px] py-3 text-[14.5px] font-semibold hover:bg-[#1f2330]"
        >
          Cancel
        </button>
      </div>
    )
  }

  /* ---- connecting screen ---- */
  if (!joined || !minDone) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-[#12141c] px-6 text-center font-sans text-[#e9ebf3]">
        <style>{CSS}</style>
        {error ? (
          <>
            <h2 className="mb-2 font-display text-xl font-semibold">Couldn't connect</h2>
            <p className="mb-6 max-w-[320px] text-sm text-[#8c91a6]">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="rounded-[11px] border border-[#2a2e3d] px-[22px] py-3 text-[14.5px] font-semibold hover:bg-[#1f2330]"
            >
              Back to home
            </button>
          </>
        ) : (
          <>
            <div className="relative h-[260px] w-[260px] max-w-[80vw]">
              {CHIPS.map(([label, x, y], i) => (
                <div
                  key={label}
                  className="absolute left-1/2 top-1/2 -ml-[22px] -mt-[22px] flex h-11 w-11 items-center justify-center rounded-full border border-[#2a2e3d] bg-[#1f2330] font-display text-[12.5px] font-semibold"
                  style={{
                    '--fx': `${x}px`, '--fy': `${y}px`, '--sx': `${x * 2.35}px`, '--sy': `${y * 2.35}px`,
                    animation: `lu-chip .65s cubic-bezier(.34,1.56,.64,1) ${i * 0.08}s both`,
                  }}
                >
                  {label === 'You' ? initialsOf(userName) : label}
                </div>
              ))}
              <div className="absolute left-1/2 top-1/2 z-[2] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#2a2e3d] bg-[#191c26]">
                <span className="absolute -inset-3.5 rounded-full border border-[#f0a23e]" style={{ animation: 'lu-ring 1.8s ease-out infinite' }} />
                <div className="flex h-[22px] items-end gap-[3px]">
                  {[9, 16, 22].map((h, i) => (
                    <span
                      key={h}
                      className="w-[5px] origin-bottom rounded-[1px] bg-[#f0a23e]"
                      style={{ height: h, animation: `lu-bar 1s ease-in-out ${i * 0.15}s infinite` }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-[30px] min-h-[18px] text-[13.5px] text-[#8c91a6]">{CONNECT_MSGS[msgIdx]}</p>
          </>
        )}
      </div>
    )
  }

  /* ---- call screen ---- */
  const presenter = participants.find((p) => p.sharing)
  const pinned = participants.find((p) => p.id === pinnedId)
  const mode = presenter ? 'share' : pinned || view === 'speaker' ? 'stage' : 'grid'
  const main = presenter || pinned || participants.find((p) => !p.isYou) || participants[0]
  const strip = participants.filter((p) => p.id !== main.id)
  const vertical = mode === 'share' && !narrow
  const n = participants.length
  const cols = narrow ? (n <= 1 ? 1 : 2) : n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4
  const togglePin = (id) => setPinnedId((cur) => (cur === id ? null : id))
  const renderTile = (p, extra = {}) => (
    <Tile
      p={p}
      stream={streamOf(p)}
      mirror={p.isYou && !screenStream}
      pinned={pinnedId === p.id}
      onClick={() => togglePin(p.id)}
      quality={p.isYou ? null : quality[p.id] || { level: 0 }}
      {...extra}
    />
  )

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[#12141c] font-sans text-[#e9ebf3]">
      <style>{CSS}</style>
      {participants.filter((p) => !p.isYou).map((p) => (
        <RemoteAudio key={p.id} stream={streamOf(p)} />
      ))}

      {/* top bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2a2e3d] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3 font-display text-[15px] font-semibold">
          <span className="truncate">{room?.title || code}</span>
          <button
            onClick={copyCode}
            title="Copy meeting code"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#2a2e3d] bg-[#1f2330] px-2.5 py-[5px] font-mono text-[11.5px] font-medium text-[#8c91a6] hover:border-[#f0a23e] hover:text-[#e9ebf3]"
          >
            <Icon name="copy" className="h-3 w-3" />
            {code}
          </button>
          {waitingRoomOn && (
            <span title="Waiting room is on" className="hidden shrink-0 items-center gap-1 font-sans text-[11.5px] font-medium text-[#8c91a6] sm:flex">
              <Icon name="lock" className="h-3 w-3" /> Waiting room
            </span>
          )}
          {amHost && (
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[#f0a23e]/15 px-2 py-0.5 font-sans text-[11px] font-semibold text-[#f0a23e] sm:flex">
              <Icon name="crown" className="h-3 w-3" /> Host
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => openPanel('people')}
            className="relative flex items-center gap-1.5 rounded-full border border-[#2a2e3d] bg-[#1f2330] px-3 py-1.5 text-[12.5px]"
          >
            <Icon name="people" className="h-3.5 w-3.5" />
            {n}
            {amHost && waitingList.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#f0a23e] px-1 text-[10px] font-bold text-[#2a1707]">
                {waitingList.length}
              </span>
            )}
          </button>
          {[['grid', 'Grid view'], ['speaker', 'Speaker view']].map(([key, label]) => (
            <button
              key={key}
              title={label}
              aria-label={label}
              onClick={() => { setView(key); setPinnedId(null) }}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                view === key && !pinned ? 'border-[#f0a23e] bg-[#f0a23e] text-[#2a1707]' : 'border-[#2a2e3d] bg-[#1f2330] text-[#8c91a6]'
              }`}
            >
              <Icon name={key} className="h-[15px] w-[15px]" />
            </button>
          ))}
          <div className="text-[13px] tabular-nums text-[#8c91a6]" title="Meeting time">{fmtClock(elapsed)}</div>
        </div>
      </div>

      {/* someone is waiting: a quick admit bar for the host */}
      {amHost && waitingList.length > 0 && panel !== 'people' && (
        <div className="mx-[18px] mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#f0a23e]/40 bg-[#f0a23e]/10 px-4 py-2.5 text-[13px]">
          <Icon name="lock" className="h-4 w-4 text-[#f0a23e]" />
          <span className="min-w-0 flex-1 truncate">
            {waitingList.length === 1 ? `${waitingList[0].name} is waiting to join` : `${waitingList.length} people are waiting to join`}
          </span>
          {waitingList.length === 1 ? (
            <>
              <button onClick={() => host.deny(waitingList[0].id)} className="rounded-lg px-3 py-1 font-semibold text-[#8c91a6] hover:text-[#e9ebf3]">
                Deny
              </button>
              <button onClick={() => host.admit(waitingList[0].id)} className="rounded-lg bg-[#f0a23e] px-3 py-1 font-semibold text-[#2a1707]">
                Admit
              </button>
            </>
          ) : (
            <button onClick={() => openPanel('people')} className="rounded-lg bg-[#f0a23e] px-3 py-1 font-semibold text-[#2a1707]">
              View
            </button>
          )}
        </div>
      )}

      {/* stage + side panel */}
      <div className="relative flex min-h-0 flex-1 gap-3 p-[18px]">
        {mode === 'grid' ? (
          <div className="grid min-h-0 min-w-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: 'minmax(0,1fr)' }}>
            {participants.map((p) => (
              <div key={p.id} className="min-h-0 min-w-0">{renderTile(p)}</div>
            ))}
          </div>
        ) : (
          <div className={`flex min-h-0 min-w-0 flex-1 gap-3 ${vertical ? 'flex-row' : 'flex-col'}`}>
            <div className="min-h-0 min-w-0 flex-1">{renderTile(main, { size: 'lg', contain: !!presenter })}</div>
            {strip.length > 0 && (
              <div className={`flex shrink-0 gap-2.5 overflow-auto ${vertical ? 'w-[150px] flex-col' : 'h-[88px] flex-row'}`}>
                {strip.map((p) => (
                  <div key={p.id} className={`shrink-0 ${vertical ? 'h-[88px]' : 'w-[130px]'}`}>{renderTile(p, { size: 'sm' })}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {panel && (
          <aside className="z-10 flex w-[300px] shrink-0 flex-col overflow-hidden rounded-[14px] border border-[#2a2e3d] bg-[#191c26] shadow-[-10px_0_30px_-10px_rgba(0,0,0,.5)] max-md:absolute max-md:inset-y-[18px] max-md:right-[18px] max-md:w-[88%] max-md:max-w-[320px]">
            <div className="flex shrink-0 items-center justify-between border-b border-[#2a2e3d] py-1.5 pl-3.5 pr-2">
              <div className="px-1.5 py-2 font-display text-sm font-semibold">
                {panel === 'people' ? `People (${n})` : 'Chat'}
              </div>
              <button onClick={() => setPanel(null)} aria-label="Close panel" className="rounded-lg px-2 py-1.5 text-xl leading-none text-[#8c91a6] hover:bg-[#1f2330] hover:text-[#e9ebf3]">×</button>
            </div>

            {panel === 'people' ? (
              <div className="flex flex-1 flex-col overflow-y-auto px-3.5 py-3">
                {/* host: waiting room switch + people waiting */}
                {amHost && (
                  <div className="mb-3 space-y-2.5 border-b border-[#2a2e3d] pb-3">
                    <button
                      role="switch"
                      aria-checked={waitingRoomOn}
                      onClick={() => host.setWaitingRoom(!waitingRoomOn)}
                      className="flex w-full items-center gap-2.5 text-left"
                    >
                      <Icon name="lock" className="h-4 w-4 shrink-0 text-[#8c91a6]" />
                      <span className="flex-1 text-[13px]">Waiting room</span>
                      <span className={`relative h-5 w-9 rounded-full transition-colors ${waitingRoomOn ? 'bg-[#f0a23e]' : 'bg-[#2a2e3d]'}`} aria-hidden="true">
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left] ${waitingRoomOn ? 'left-[18px]' : 'left-0.5'}`} />
                      </span>
                    </button>
                    {waitingList.length > 0 && (
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-[#8c91a6]">Waiting ({waitingList.length})</span>
                          {waitingList.length > 1 && (
                            <button onClick={() => host.admit('all')} className="text-[12px] font-semibold text-[#f0a23e] hover:underline">
                              Admit all
                            </button>
                          )}
                        </div>
                        {waitingList.map((w) => (
                          <div key={w.id} className="flex items-center gap-2 py-1.5">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1f2330] font-display text-[10.5px] font-semibold text-[#8c91a6]">
                              {initialsOf(w.name)}
                            </div>
                            <span className="min-w-0 flex-1 truncate text-[13px]">{w.name}</span>
                            <button onClick={() => host.deny(w.id)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#8c91a6] hover:bg-[#1f2330] hover:text-[#e9ebf3]">
                              Deny
                            </button>
                            <button onClick={() => host.admit(w.id)} className="rounded-md bg-[#f0a23e] px-2 py-1 text-[12px] font-semibold text-[#2a1707]">
                              Admit
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-0.5">
                  {participants.map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5 py-[7px]">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-semibold"
                        style={{ background: `${p.color}2e`, color: p.color }}
                      >
                        {initialsOf(p.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px]">
                          {p.isYou ? 'You' : p.name}
                          {p.hand && ' 🖐️'}
                        </div>
                        {p.host && <div className="text-[11px] font-semibold text-[#f0a23e]">Host</div>}
                      </div>
                      {/* host controls for everyone else */}
                      {amHost && !p.isYou && (
                        confirmRemove === p.id ? (
                          <span className="flex items-center gap-1">
                            <button onClick={() => setConfirmRemove(null)} className="rounded-md px-1.5 py-1 text-[11.5px] text-[#8c91a6] hover:text-[#e9ebf3]">
                              Cancel
                            </button>
                            <button onClick={() => host.remove(p.id)} className="rounded-md bg-[#e2604f] px-2 py-1 text-[11.5px] font-semibold text-white">
                              Remove
                            </button>
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => host.mute(p.id)}
                              disabled={!p.mic}
                              title={p.mic ? `Mute ${p.name}` : `${p.name} is muted`}
                              aria-label={`Mute ${p.name}`}
                              className="rounded-md p-1 text-[#8c91a6] hover:bg-[#1f2330] hover:text-[#e9ebf3] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                              <Icon name="mic" off className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmRemove(p.id)}
                              title={`Remove ${p.name}`}
                              aria-label={`Remove ${p.name}`}
                              className="rounded-md p-1 text-[#8c91a6] hover:bg-[#1f2330] hover:text-[#e2604f]"
                            >
                              <Icon name="remove" className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )
                      )}
                      {confirmRemove !== p.id && (
                        <>
                          <button
                            onClick={() => togglePin(p.id)}
                            title="Pin"
                            aria-label={`Pin ${p.isYou ? 'yourself' : p.name}`}
                            className={`rounded-md p-1 hover:bg-[#1f2330] ${pinnedId === p.id ? 'text-[#f0a23e]' : 'text-[#8c91a6]'}`}
                          >
                            <Icon name="pin" className="h-3.5 w-3.5" />
                          </button>
                          <Icon name="mic" off={!p.mic} className={`h-[15px] w-[15px] ${p.mic ? 'text-[#8c91a6]' : 'text-[#e2604f]'}`} />
                          <Icon name="cam" off={!p.cam} className={`h-[15px] w-[15px] ${p.cam ? 'text-[#8c91a6]' : 'text-[#e2604f]'}`} />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col px-3.5 pb-3 pt-3">
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-1.5 pt-8">
                  {messages.length === 0 ? (
                    <div className="m-auto px-2.5 py-8 text-center text-[13px] text-[#8c91a6]">No messages yet — say hi 👋</div>
                  ) : (
                    messages.map((m, i) => (
                      <ChatMessage
                        key={m.id || i}
                        m={m}
                        onReact={reactToMessage}
                        grouped={i > 0 && messages[i - 1].fromId === m.fromId}
                      />
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="h-5 shrink-0 text-[11.5px] text-[#8c91a6]" aria-live="polite">
                  {typingNames.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      {typingLine(typingNames)}
                      {[0, 0.2, 0.4].map((d) => (
                        <span key={d} style={{ animation: `lu-dot 1.2s ${d}s infinite` }}>.</span>
                      ))}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 gap-2 border-t border-[#2a2e3d] pt-2.5">
                  <input
                    value={draft}
                    onChange={(e) => onDraftChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                    onBlur={() => setMyTyping(false)}
                    maxLength={1000}
                    placeholder="Message everyone"
                    aria-label="Chat message"
                    className="min-w-0 flex-1 rounded-[10px] border border-[#2a2e3d] bg-[#1f2330] px-3 py-[9px] text-[13px] outline-none placeholder:text-[#8c91a6] focus:border-[#f0a23e]"
                  />
                  <button onClick={sendChat} className="shrink-0 rounded-[11px] bg-[#f0a23e] px-3.5 py-[9px] text-[13px] font-semibold text-[#2a1707] hover:opacity-90">
                    Send
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* reactions */}
      {showReactions && (
        <div className="absolute bottom-[84px] left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-full border border-[#2a2e3d] bg-[#191c26] px-2.5 py-2 shadow-[0_20px_40px_-16px_rgba(0,0,0,.5)]">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => sendReaction(e)} className="rounded-full p-1.5 text-xl hover:bg-[#1f2330]">{e}</button>
          ))}
        </div>
      )}
      {floaters.map((f) => (
        <div key={f.id} className="pointer-events-none absolute bottom-24 z-[70] text-[26px]" style={{ left: `${f.left}%`, animation: 'lu-float 1.6s ease-out forwards' }}>
          {f.emoji}
        </div>
      ))}

      {/* control bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2.5 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-2">
        <Ctrl icon="mic" off={!me.mic} tone={me.mic ? 'light' : 'red'} title={me.mic ? 'Mute' : 'Unmute'} onClick={toggleMic} disabled={!avail.mic} />
        <Ctrl icon="cam" off={!me.cam} tone={me.cam ? 'light' : 'red'} title={me.cam ? 'Stop video' : 'Start video'} onClick={toggleCam} disabled={!avail.cam} />
        <Ctrl icon="hand" tone={me.hand ? 'amber' : 'plain'} title="Raise hand" onClick={() => updateMe({ hand: !me.hand })} />
        <Ctrl icon="smile" tone={showReactions ? 'light' : 'plain'} title="Reactions" onClick={() => setShowReactions((v) => !v)} />
        <div className="mx-1 h-[26px] w-px bg-[#2a2e3d]" />
        {navigator.mediaDevices?.getDisplayMedia && (
          <Ctrl
            icon="screen"
            tone={me.sharing ? 'amber' : 'plain'}
            title={presenter && !me.sharing ? 'Someone else is presenting' : me.sharing ? 'Stop sharing' : 'Share screen'}
            onClick={me.sharing ? stopShare : startShare}
            disabled={!!presenter && !me.sharing}
          />
        )}
        <Ctrl
          icon="people"
          tone={panel === 'people' ? 'light' : 'plain'}
          title="Participants"
          onClick={() => openPanel('people')}
          badge={amHost ? waitingList.length : 0}
        />
        <Ctrl icon="chat" tone={panel === 'chat' ? 'light' : 'plain'} title="Chat" onClick={() => openPanel('chat')} badge={unread} />
        <div className="mx-1 h-[26px] w-px bg-[#2a2e3d]" />
        <button
          onClick={() => setConfirmLeave(true)}
          title="Leave call"
          aria-label="Leave call"
          className="flex h-[46px] w-16 items-center justify-center rounded-[23px] bg-[#e2604f] text-white transition active:scale-95"
        >
          <Icon name="leave" />
        </button>
      </div>

      {/* leave confirmation: focus starts on Cancel; the host can also end it for everyone */}
      {confirmLeave && (
        <div
          onClick={(e) => e.target === e.currentTarget && setConfirmLeave(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b10]/60 p-5"
        >
          <div role="dialog" aria-modal="true" className="w-[340px] max-w-full rounded-2xl border border-[#2a2e3d] bg-[#191c26] p-[26px] text-center">
            <h3 className="mb-2 font-display text-[17px] font-semibold">{amHost ? 'Leave or end the meeting?' : 'Leave the meeting?'}</h3>
            <p className="mb-[22px] text-[13.5px] leading-snug text-[#8c91a6]">
              {amHost
                ? n > 1
                  ? 'If you just leave, the host role passes to someone else and the meeting continues.'
                  : 'You can rejoin anytime with the same meeting code.'
                : 'You can rejoin anytime with the same meeting code.'}
            </p>
            <div className="flex gap-2.5">
              <button
                autoFocus
                onClick={() => setConfirmLeave(false)}
                className="flex-1 rounded-[11px] border border-[#2a2e3d] px-[18px] py-3 text-[14.5px] font-semibold hover:bg-[#1f2330]"
              >
                Cancel
              </button>
              <button onClick={leave} className="flex-1 rounded-[11px] bg-[#e2604f] px-[18px] py-3 text-[14.5px] font-semibold text-white">
                Leave
              </button>
            </div>
            {amHost && n > 1 && (
              <button
                onClick={host.end}
                className="mt-2.5 w-full rounded-[11px] border border-[#e2604f]/50 px-[18px] py-2.5 text-[13.5px] font-semibold text-[#e2604f] hover:bg-[#e2604f]/10"
              >
                End meeting for everyone
              </button>
            )}
          </div>
        </div>
      )}

      {/* toast */}
      <div
        role="status"
        className={`pointer-events-none fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-[9px] rounded-xl border border-[#2a2e3d] bg-[#191c26] px-5 py-3 text-[13.5px] font-medium shadow-[0_20px_40px_-16px_rgba(0,0,0,.5)] transition-opacity duration-200 ${toast ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className="h-[7px] w-[7px] rounded-full bg-[#f0a23e]" />
        {toast}
      </div>
    </div>
  )
}

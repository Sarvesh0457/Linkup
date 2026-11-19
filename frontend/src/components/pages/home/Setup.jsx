import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext.jsx'

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

function generateCode() {
  let part = ''
  for (let i = 0; i < 3; i++) part += LETTERS[Math.floor(Math.random() * LETTERS.length)]
  return `${part}-${Math.floor(1000 + Math.random() * 9000)}`
}

function initialsOf(name) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || 'U'
  )
}

function MicIcon({ off }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[19px] w-[19px]">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  )
}

function CamIcon({ off }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[19px] w-[19px]">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M22 8l-6 4 6 4V8z" />
      {off && <path d="M2 2l20 20" />}
    </svg>
  )
}

const primaryBtn =
  'w-full rounded-[11px] bg-[#f0a23e] px-[22px] py-3 text-[14.5px] font-semibold text-[#2a1707] transition hover:opacity-90 active:scale-[0.97]'
const inputCls =
  'w-full rounded-[10px] border bg-[#1f2330] px-[13px] py-[11px] text-sm text-[#e9ebf3] outline-none transition-colors placeholder:text-[#8c91a6] focus:border-[#f0a23e]'

export default function Setup({ mode = 'create' }) {
  const navigate = useNavigate()
  const { user, isLoggedIn } = useAuth()
  const name = user?.name || 'You'

  const [code] = useState(generateCode)
  const [title, setTitle] = useState('')
  const location = useLocation()
  // prefilled when arriving from a call link (Call.jsx and login pass the code along)
  const [joinCode, setJoinCode] = useState(() => location.state?.code || '')
  const [joinError, setJoinError] = useState(false)
  const [copied, setCopied] = useState(false)

  const [stream, setStream] = useState(null)
  const [mediaError, setMediaError] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

  const videoRef = useRef(null)
  const meterRef = useRef(null)

  const hasCam = !!stream && stream.getVideoTracks().length > 0
  const hasMic = !!stream && stream.getAudioTracks().length > 0
  const camActive = camOn && hasCam
  const micActive = micOn && hasMic

  // must be logged in to get here
  useEffect(() => {
    if (!isLoggedIn) navigate('/login', { replace: true, state: { next: location.pathname, code: location.state?.code } })
  }, [isLoggedIn, navigate, location.pathname, location.state?.code])

  // camera + mic preview
  useEffect(() => {
    let cancelled = false
    let active = null

    async function start() {
      const attempts = [
        { video: true, audio: true },
        { video: false, audio: true },
        { video: true, audio: false },
      ]
      let s = null
      for (const constraints of attempts) {
        try {
          s = await navigator.mediaDevices.getUserMedia(constraints)
          break
        } catch {
          /* try the next combination */
        }
      }

      if (cancelled) {
        s?.getTracks().forEach((t) => t.stop())
        return
      }
      if (!s) {
        setMediaError('Camera and microphone are blocked or unavailable. You can still join without them.')
        return
      }
      active = s
      setStream(s)
    }

    start()
    return () => {
      cancelled = true
      active?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // show the stream in the <video>
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  // apply mic/cam toggles to the preview tracks
  useEffect(() => {
    stream?.getVideoTracks().forEach((t) => (t.enabled = camOn))
    stream?.getAudioTracks().forEach((t) => (t.enabled = micOn))
  }, [stream, camOn, micOn])

  // mic level meter (updates the DOM directly to avoid re-rendering 60x/sec)
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    ctx.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf

    const tick = () => {
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length
      if (meterRef.current) meterRef.current.style.width = `${Math.min(100, (avg / 80) * 100)}%`
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ctx.close()
    }
  }, [stream])

  function enterCall(roomCode, meetingTitle) {
    navigate(`/call/${encodeURIComponent(roomCode)}`, {
      state: { title: meetingTitle, mic: micActive, cam: camActive },
    })
  }

  function startNew() {
    enterCall(code, title.trim())
  }

  function startJoin() {
    // accepts "ABC-1234" or a pasted link ending in the code
    const cleaned = joinCode.trim().split('/').pop().toUpperCase().replace(/\s+/g, '')
    if (!cleaned) {
      setJoinError(true)
      return
    }
    enterCall(cleaned, '')
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* clipboard can be blocked; still show feedback */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const toggleBase =
    'flex h-11 w-11 items-center justify-center rounded-full border border-[#2a2e3d] transition disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-6 py-10 font-sans">
      <div className="flex w-full max-w-[940px] flex-col overflow-hidden rounded-[20px] border border-[#2a2e3d] bg-[#191c26] shadow-[0_30px_70px_-30px_rgba(0,0,0,.6)] md:min-h-[420px] md:flex-row">
        {/* ---- preview / lobby ---- */}
        <div className="flex min-w-0 flex-1 flex-col p-[26px]">
          <div className="relative mb-[14px] flex min-h-[200px] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#3a3f56] to-[#26293a]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${camActive ? '' : 'hidden'}`}
            />
            {!camActive && (
              <div className="flex h-[70px] w-[70px] items-center justify-center rounded-full bg-white/10 font-display text-[22px] font-semibold text-[#e9ebf3]">
                {initialsOf(name)}
              </div>
            )}
            <div className="absolute bottom-3 left-3 rounded-lg bg-[#0a0b10]/50 px-[10px] py-1 text-xs text-[#e9ebf3]">
              {name}
            </div>
          </div>

          {/* mic level */}
          <div className="mx-auto mb-4 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-[#2a2e3d]">
            <div ref={meterRef} className="h-full w-0 rounded-full bg-[#f0a23e] transition-[width] duration-75" />
          </div>

          <div className="flex justify-center gap-[10px]">
            <button
              type="button"
              disabled={!hasMic}
              onClick={() => setMicOn((v) => !v)}
              title={micActive ? 'Mute' : 'Unmute'}
              className={`${toggleBase} ${micActive ? 'bg-[#e9ebf3] text-[#12141c]' : 'bg-[#1f2330] text-[#e2604f]'}`}
            >
              <MicIcon off={!micActive} />
            </button>
            <button
              type="button"
              disabled={!hasCam}
              onClick={() => setCamOn((v) => !v)}
              title={camActive ? 'Stop video' : 'Start video'}
              className={`${toggleBase} ${camActive ? 'bg-[#e9ebf3] text-[#12141c]' : 'bg-[#1f2330] text-[#e2604f]'}`}
            >
              <CamIcon off={!camActive} />
            </button>
          </div>

          {mediaError && <p className="mt-3 text-center text-xs text-[#e2604f]">{mediaError}</p>}
        </div>

        {/* ---- create / join ---- */}
        <div className="flex min-w-0 flex-1 flex-col border-t border-[#2a2e3d] px-[30px] py-7 md:border-l md:border-t-0">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mb-4 self-start text-[13px] text-[#8c91a6] hover:text-[#e9ebf3]"
          >
            ← Back
          </button>

          <div className="mb-6 flex rounded-[10px] bg-[#1f2330] p-1">
            {[
              ['create', 'Create a room', '/new'],
              ['join', 'Join a room', '/join'],
            ].map(([key, label, path]) => (
              <button
                key={key}
                type="button"
                onClick={() => navigate(path, { replace: true })}
                className={`flex-1 rounded-lg py-[9px] text-[13.5px] font-semibold transition ${
                  mode === key ? 'bg-[#f0a23e] text-[#2a1707]' : 'text-[#8c91a6]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'create' ? (
            <div className="flex flex-1 flex-col">
              <h2 className="mb-2 font-display text-[19px] font-semibold text-[#e9ebf3]">Your room is ready</h2>
              <p className="mb-5 text-[13.5px] leading-normal text-[#8c91a6]">
                Share this code with your team. It stays active as long as someone's in the room.
              </p>

              <label className="mb-1.5 block text-[12.5px] text-[#8c91a6]">Meeting title (optional) <span className="text-[#5f6478]">· leave blank to use the code</span></label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Product sync — Q4 roadmap"
                className={`${inputCls} mb-[14px] border-[#2a2e3d]`}
              />

              <div className="mb-[22px] flex items-center justify-between rounded-xl border border-[#2a2e3d] bg-[#1f2330] px-4 py-[14px]">
                <span className="font-mono text-[17px] tracking-[1px] text-[#f0a23e]">{code}</span>
                <button
                  type="button"
                  onClick={copyCode}
                  className="rounded-[11px] border border-[#2a2e3d] px-[14px] py-[7px] text-[12.5px] font-semibold text-[#e9ebf3] hover:bg-[#191c26]"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <button type="button" onClick={startNew} className={`${primaryBtn} mt-auto`}>
                Start the call →
              </button>
            </div>
          ) : (
            <div className="flex flex-1 flex-col">
              <h2 className="mb-2 font-display text-[19px] font-semibold text-[#e9ebf3]">Enter a meeting code</h2>
              <p className="mb-5 text-[13.5px] leading-normal text-[#8c91a6]">
                Ask whoever's hosting for their room code.
              </p>

              <label className="mb-1.5 block text-[12.5px] text-[#8c91a6]">Meeting code</label>
              <input
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value)
                  setJoinError(false)
                }}
                onKeyDown={(e) => e.key === 'Enter' && startJoin()}
                placeholder="e.g. LKP-7291"
                className={`${inputCls} mb-1 font-mono uppercase tracking-[1.5px] placeholder:font-sans placeholder:normal-case placeholder:tracking-normal ${
                  joinError ? 'border-[#e2604f]' : 'border-[#2a2e3d]'
                }`}
              />
              {joinError && <p className="mb-2 text-xs text-[#e2604f]">Enter a meeting code to continue.</p>}

              <button type="button" onClick={startJoin} className={`${primaryBtn} mt-auto`}>
                Join the call →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
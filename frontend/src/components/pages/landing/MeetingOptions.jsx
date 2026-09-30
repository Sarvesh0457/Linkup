import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext.jsx"

export default function MeetingOptions() {
  const { user } = useAuth()
  const firstName = user?.name?.split(" ")[0] || "there"
  const navigate = useNavigate()

  return (
    <div className="grid min-h-[calc(100vh-96px)] grid-cols-1 items-center gap-9 px-6 py-10 sm:px-12 lg:grid-cols-[1.05fr_1fr]">
      <div className="text-center lg:text-left">
        <h1 className="mb-3.5 font-heading text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
          Good to see you, {firstName}
        </h1>
        <p className="mb-7 max-w-md text-[15.5px] leading-relaxed text-muted-ink mx-auto lg:mx-0">
          Start a new call or join one already in progress.
        </p>

        <div className="flex flex-wrap justify-center gap-4.5 lg:justify-start">
          <button
            onClick={() => navigate("/new")}
            className="group relative w-56 rounded-2xl border border-line bg-panel p-6 text-left transition hover:-translate-y-0.5 hover:border-amber"
          >
            <div className="mb-4 flex h-10.5 w-10.5 items-center justify-center rounded-xl bg-amber/15 text-amber">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <span className="absolute right-4.5 top-5 text-muted-ink transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-amber">→</span>
            <h3 className="mb-1.5 font-heading text-base font-semibold text-ink">New meeting</h3>
            <p className="text-[13px] leading-snug text-muted-ink">
              Create a room and share the code with your team.
            </p>
          </button>

          <button
            onClick={() => navigate("/join")}
            className="group relative w-56 rounded-2xl border border-line bg-panel p-6 text-left transition hover:-translate-y-0.5 hover:border-amber"
          >
            <div className="mb-4 flex h-10.5 w-10.5 items-center justify-center rounded-xl bg-amber/15 text-amber">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
              </svg>
            </div>
            <span className="absolute right-4.5 top-5 text-muted-ink transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-amber">→</span>
            <h3 className="mb-1.5 font-heading text-base font-semibold text-ink">Join meeting</h3>
            <p className="text-[13px] leading-snug text-muted-ink">
              Enter a meeting code to join an existing call.
            </p>
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="w-full max-w-[400px] rotate-[1.6deg] rounded-[20px] border border-line bg-panel p-4 shadow-[0_30px_60px_-22px_rgba(0,0,0,0.55)]">
          <div className="flex items-center justify-between px-1.5 pb-3">
            <span className="text-[0.75rem] font-semibold text-muted-ink">Your last call</span>
            <span className="text-[0.75rem] text-muted-ink">2 days ago</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { i: "RM", n: "Rhea", grad: "from-[#3a3f56] to-[#26293a]" },
              { i: "JK", n: "Jonas", grad: "from-[#4a4166] to-[#26293a]" },
              { i: "SA", n: "Sana", grad: "from-[#3f4f5a] to-[#26293a]" },
              { i: "DP", n: "Devan", grad: "from-panel-2 to-panel-2" },
            ].map((t) => (
              <div key={t.i} className={`relative flex aspect-[1.35] items-center justify-center rounded-xl bg-gradient-to-br ${t.grad}`}>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 font-heading text-[11.5px] font-semibold text-ink">
                  {t.i}
                </div>
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/50 px-1.5 py-0.5 text-[9.5px] text-ink">
                  {t.n}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
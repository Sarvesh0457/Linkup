import { Button } from "@/components/ui/button"
import { useNavigate } from "react-router-dom"

export default function Hero() {
  const navigate = useNavigate()

  return (
    <div className="grid min-h-[calc(100vh-96px)] grid-cols-1 items-center gap-9 px-6 py-10 sm:px-12 lg:grid-cols-[1.05fr_1fr]">
      <div className="text-center lg:text-left">
        <h1 className="max-w-xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl font-sans">
          One link. Everyone in.
        </h1>
        <p className="mx-auto my-4.5 max-w-md text-[1.08rem] leading-relaxed text-muted-ink lg:mx-0">
          LinkUp brings your team into one fast, distraction-free call — no
          downloads, no fuss, just hit the link.
        </p>
        <div className="mb-6.5 flex flex-wrap justify-center gap-3 lg:justify-start">
          <Button
            className="bg-amber text-amber-ink hover:bg-amber/90 w-[10rem] h-[2.9rem] text-base rounded-lg font-semibold"
            onClick={() => navigate("/signup")}
          >
            Get started free
          </Button>
          <Button
            variant="outline"
            className="border-line bg-transparent text-ink hover:bg-panel-2 w-[10rem] h-[2.9rem] text-base rounded-lg font-semibold"
            onClick={() => navigate("/login")}
          >
            I have an account
          </Button>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-ink lg:justify-start">
          {["Free to use", "No downloads", "Works in your browser"].map((label) => (
            <li key={label} className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber" />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-center">
        <div className="w-full max-w-[400px] rotate-[1.6deg] rounded-[20px] border border-line bg-panel p-4 shadow-[0_30px_60px_-22px_rgba(0,0,0,0.55)]">
          <div className="flex items-center justify-between px-1.5 pb-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Live
            </div>
            <div className="flex h-3.5 items-center gap-[2px]">
              <span className="h-1 w-[3px] animate-wave rounded-sm bg-amber" />
              <span className="h-1 w-[3px] animate-wave rounded-sm bg-amber [animation-delay:.15s]" />
              <span className="h-1 w-[3px] animate-wave rounded-sm bg-amber [animation-delay:.3s]" />
              <span className="h-1 w-[3px] animate-wave rounded-sm bg-amber [animation-delay:.45s]" />
            </div>
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
import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext.jsx"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api.js"

// same rules as the server (backend/src/lib/validate.js), checked here first for quicker feedback
const USERNAME_RULE = /^[a-z0-9._-]{3,30}$/
function signupProblem({ name, username, password }) {
  if (name.trim().length > 40) return "Name can be at most 40 characters."
  if (!USERNAME_RULE.test(username.trim().toLowerCase()))
    return "Username must be 3-30 characters: letters, numbers, dots, dashes or underscores."
  if (password.length < 8) return "Password must be at least 8 characters."
  if (new TextEncoder().encode(password).length > 72) return "Password is too long (max 72 characters)."
  return null
}

export default function Authenticate({ mode = "login" }) {
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const isLogin = mode === "login"

  // set when a call link sent us here while logged out: { next: "/join", code: "ABC-1234" }
  const redirect = location.state?.next ? location.state : null

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")

    if (!username.trim() || !password.trim() || (!isLogin && !name.trim())) {
      setError("Please fill in all fields.")
      return
    }

    if (!isLogin) {
      const problem = signupProblem({ name, username, password })
      if (problem) {
        setError(problem)
        return
      }
    }

    setLoading(true)
    try {
      // the server sets an httpOnly session cookie and returns the public profile;
      // sign-up logs you in straight away
      const data = isLogin
        ? await api("/auth/login", { method: "POST", body: { username, password } })
        : await api("/auth/register", { method: "POST", body: { name, username, password } })
      login(data.user)

      // back to the call link they opened, with the code filled in; otherwise home
      if (redirect) navigate(redirect.next, { replace: true, state: { code: redirect.code } })
      else navigate("/")
    } catch (err) {
      setError(err.message || "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-[380px] rounded-2xl border border-line bg-panel p-8 shadow-[0_30px_60px_-28px_rgba(0,0,0,0.6)]">
        <button
          onClick={() => navigate("/")}
          className="mb-4.5 text-[13px] text-muted-ink hover:text-ink"
        >
          ← Back
        </button>

        <div className="mb-5 flex justify-center">
          <div className="flex h-5.5 items-end gap-[3px]">
            <span className="h-2.5 w-[5px] rounded-[1px] bg-amber" />
            <span className="h-4 w-[5px] rounded-[1px] bg-amber" />
            <span className="h-5.5 w-[5px] rounded-[1px] bg-amber" />
          </div>
        </div>

        <h2 className="mb-1.5 text-center font-heading text-[22px] font-semibold text-ink">
          {isLogin ? "Welcome back" : "Create your account"}
        </h2>
        <p className="mb-6.5 text-center text-[13.5px] text-muted-ink">
          {isLogin
            ? "Log in to jump into your next call."
            : "It's free — set up your team in under a minute."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {!isLogin && (
            <div>
              <Label htmlFor="name" className="mb-1.5 block text-[12.5px] text-muted-ink">
                Full name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jordan Lee"
                autoComplete="name"
                maxLength={40}
                className="border-line bg-panel-2 text-ink placeholder:text-muted-ink"
              />
            </div>
          )}

          <div>
            <Label htmlFor="username" className="mb-1.5 block text-[12.5px] text-muted-ink">
              Username
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="jordanlee"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={30}
              className="border-line bg-panel-2 text-ink placeholder:text-muted-ink"
            />
            {!isLogin && (
              <p className="mt-1.5 text-[11.5px] text-muted-ink">3-30 characters: letters, numbers, dots, dashes, underscores</p>
            )}
          </div>

          <div>
            <Label htmlFor="password" className="mb-1.5 block text-[12.5px] text-muted-ink">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isLogin ? "current-password" : "new-password"}
              maxLength={72}
              className="border-line bg-panel-2 text-ink placeholder:text-muted-ink"
            />
            {!isLogin && <p className="mt-1.5 text-[11.5px] text-muted-ink">At least 8 characters</p>}
          </div>

          {error && <p className="text-[12.5px] text-red-400">{error}</p>}

          <Button
            type="submit"
            disabled={loading}
            className="h-auto w-full rounded-[11px] bg-amber py-3 text-[14.5px] font-semibold text-amber-ink hover:bg-amber/90"
          >
            {loading ? "Please wait…" : isLogin ? "Log in" : "Create account"}
          </Button>
        </form>

        <p className="mt-4.5 text-center text-[13px] text-muted-ink">
          {isLogin ? (
            <>
              Don't have an account?{" "}
              <button onClick={() => navigate("/signup", { replace: true, state: location.state })} className="font-semibold text-amber hover:underline">
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => navigate("/login", { replace: true, state: location.state })} className="font-semibold text-amber hover:underline">
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
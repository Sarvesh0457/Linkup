import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext.jsx"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001"

export default function Authenticate({ mode = "login" }) {
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()
  const { login } = useAuth()
  const isLogin = mode === "login"

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")

    if (!username.trim() || !password.trim() || (!isLogin && !name.trim())) {
      setError("Please fill in all fields.")
      return
    }

    setLoading(true)
    try {
      if (isLogin) {
        const res = await fetch(`${API_URL}/api/v1/users/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || "Login failed")

        // Backend's /login doesn't return `name` yet — see the patch above.
        // Falls back to the username so the greeting isn't blank until then.
        login({ name: data.name || username, token: data.token })
        localStorage.setItem("linkup_token", data.token)
      } else {
        const registerRes = await fetch(`${API_URL}/api/v1/users/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, username, password }),
        })
        const registerData = await registerRes.json()
        if (!registerRes.ok) throw new Error(registerData.message || "Sign up failed")

        // /register doesn't return a token, so log in right after with the
        // same credentials to actually get one.
        const loginRes = await fetch(`${API_URL}/api/v1/users/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        })
        const loginData = await loginRes.json()
        if (!loginRes.ok) throw new Error(loginData.message || "Login after sign up failed")

        login({ name, token: loginData.token })
        localStorage.setItem("linkup_token", loginData.token)
      }

      navigate("/")
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
              className="border-line bg-panel-2 text-ink placeholder:text-muted-ink"
            />
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
              className="border-line bg-panel-2 text-ink placeholder:text-muted-ink"
            />
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
              <button onClick={() => navigate("/signup")} className="font-semibold text-amber hover:underline">
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => navigate("/login")} className="font-semibold text-amber hover:underline">
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
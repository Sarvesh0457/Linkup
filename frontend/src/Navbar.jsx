import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext.jsx"
import { useLocation, useNavigate } from "react-router-dom"

function Logo() {
  return (
    <div className="flex h-3.5 items-end gap-[2px]">
      {["h-1.5", "h-2.5", "h-3.5"].map((h, i) => (
        <span key={i} className={`w-1 rounded-[1px] bg-amber ${h}`} />
      ))}
    </div>
  )
}

function getInitials(name = "") {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export default function Navbar() {
  const { user, isLoggedIn, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // keep a pending call link ({ next, code }) when moving between log in and sign up
  const authState = location.state?.next ? location.state : undefined

  return (
    <nav className="flex flex-wrap items-center justify-between gap-2.5 px-6 py-5 sm:px-12 h-23">
      <div className="flex items-center gap-2.5 font-heading text-lg font-bold text-ink">
        <Logo />
        LinkUp
      </div>

      {isLoggedIn ? (
        <div className="flex items-center gap-2.5 text-[13.5px] text-muted-ink">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-panel-2 font-heading text-xs font-semibold text-ink">
            {getInitials(user?.name)}
          </div>
          {user?.name}
          <Button
            variant="outline"
            size="sm"
            className="ml-2 border-line bg-transparent text-ink hover:bg-panel-2"
            onClick={() => {
              logout()
              navigate("/")
            }}
          >
            Log out
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden items-center gap-2.5 sm:flex">
            <Button
              variant="outline"
              className="border-line bg-transparent text-ink hover:bg-panel-2 w-[6rem] h-[2.9rem] text-base rounded-lg font-semibold"
              onClick={() => navigate("/login", { state: authState })}
            >
              Log in
            </Button>
            <Button
              className="bg-amber text-amber-ink hover:bg-amber/90 w-[6rem] h-[2.9rem] text-base rounded-lg font-semibold"
              onClick={() => navigate("/signup", { state: authState })}
            >
              Sign up
            </Button>
          </div>
          <Button
            className="bg-amber text-amber-ink hover:bg-amber/90 sm:hidden w-[7.5rem] h-[2.7rem] text-base rounded-lg font-semibold"
            onClick={() => navigate("/signup", { state: authState })}
          >
            Get started
          </Button>
        </>
      )}
    </nav>
  )
}
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)
const KEY = 'linkup_auth'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function clearSession() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem('token')
    localStorage.removeItem('linkup_token') // old duplicate key; no longer written, cleared for existing users
  } catch {
    /* storage blocked */
  }
}

function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    if (s && s.token && s.expiresAt > Date.now()) return s
  } catch {
    /* corrupt value */
  }
  clearSession()
  return null
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession) // sync read, so refresh never flashes logged-out

  const login = useCallback((userData) => {
    const s = { name: userData.name, token: userData.token, expiresAt: Date.now() + WEEK_MS }
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
      localStorage.setItem('token', s.token)
    } catch {
      /* storage blocked: still logged in for this tab */
    }
    setSession(s)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  // auto-logout when the week runs out
  useEffect(() => {
    if (!session) return
    const t = setTimeout(logout, Math.max(0, session.expiresAt - Date.now()))
    return () => clearTimeout(t)
  }, [session, logout])

  // keep tabs in sync
  useEffect(() => {
    const onStorage = (e) => e.key === KEY && setSession(readSession())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = {
    user: session ? { name: session.name, token: session.token } : null,
    isLoggedIn: !!session,
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
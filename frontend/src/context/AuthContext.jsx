import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '@/lib/api.js'

// The login lives in an httpOnly cookie that JavaScript can't read (so XSS can't steal it).
// The app asks the server who is logged in (/auth/me) and only keeps the public profile in memory.
const AuthContext = createContext(null)

// keeps other open tabs in sync when you log in or out
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('linkup-auth') : null

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null) // { name, username } or null
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // logins saved by older versions of the app lived in localStorage; remove them
    try {
      ;['linkup_auth', 'token', 'linkup_token'].forEach((k) => localStorage.removeItem(k))
    } catch {
      /* storage blocked */
    }
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!channel) return
    const onMessage = (e) => {
      if (e.data?.type === 'login') setUser(e.data.user)
      if (e.data?.type === 'logout') setUser(null)
    }
    channel.addEventListener('message', onMessage)
    return () => channel.removeEventListener('message', onMessage)
  }, [])

  // called with the user returned by /auth/login or /auth/register (the cookie is already set)
  const login = useCallback((u) => {
    setUser(u)
    channel?.postMessage({ type: 'login', user: u })
  }, [])

  // ends the session on the server; everywhere = every device
  const logout = useCallback(async ({ everywhere = false } = {}) => {
    try {
      await api(everywhere ? '/auth/logout-all' : '/auth/logout', { method: 'POST' })
    } catch {
      /* already logged out or offline: still clear it here */
    }
    setUser(null)
    channel?.postMessage({ type: 'logout' })
  }, [])

  // the server said 401: the session expired or was ended elsewhere
  const sessionExpired = useCallback(() => {
    setUser(null)
    channel?.postMessage({ type: 'logout' })
  }, [])

  // wait for /auth/me before rendering, so logged-in pages don't flash the login redirect
  if (!ready) return <div className="min-h-screen bg-bg" aria-busy="true" />

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, login, logout, sessionExpired }}>{children}</AuthContext.Provider>
  )
}

// a hook next to its provider is the usual pattern; fast refresh just reloads this file fully
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)

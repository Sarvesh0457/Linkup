import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext.jsx'
import { api } from '@/lib/api.js'

// Loads the signed-in user's meeting history and offers delete / clear.
// The session cookie is sent automatically; an expired session goes back to the login page.
export function useMeetingHistory(limit = 50) {
  const { isLoggedIn, sessionExpired } = useAuth()
  const navigate = useNavigate()

  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const handleError = useCallback(
    (err) => {
      if (err.status === 401) {
        sessionExpired()
        navigate('/login', { replace: true })
        return
      }
      setError(err.message)
    },
    [sessionExpired, navigate]
  )

  const load = useCallback(async () => {
    if (!isLoggedIn) return
    setLoading(true)
    setError('')
    try {
      const data = await api(`/users/history?limit=${limit}`)
      setMeetings(data.meetings)
    } catch (err) {
      handleError(err)
    } finally {
      setLoading(false)
    }
  }, [isLoggedIn, limit, handleError])

  useEffect(() => {
    load()
  }, [load])

  const remove = useCallback(
    async (id) => {
      const before = meetings
      setMeetings((list) => list.filter((m) => m.id !== id)) // optimistic
      try {
        await api(`/users/history/${id}`, { method: 'DELETE' })
      } catch (err) {
        setMeetings(before)
        handleError(err)
      }
    },
    [meetings, handleError]
  )

  const clearAll = useCallback(async () => {
    try {
      await api('/users/history', { method: 'DELETE' })
      setMeetings([])
    } catch (err) {
      handleError(err)
    }
  }, [handleError])

  return { meetings, loading, error, reload: load, remove, clearAll }
}

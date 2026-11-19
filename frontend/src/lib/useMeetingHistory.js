import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext.jsx'
import { api } from '@/lib/api.js'

// Loads the signed-in user's meeting history and offers delete / clear.
// An expired login sends the user back to the login page.
export function useMeetingHistory(limit = 50) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const token = user?.token

  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const handleError = useCallback(
    (err) => {
      if (err.status === 401) {
        logout()
        navigate('/login', { replace: true })
        return
      }
      setError(err.message)
    },
    [logout, navigate]
  )

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const data = await api(`/users/history?limit=${limit}`, { token })
      setMeetings(data.meetings)
    } catch (err) {
      handleError(err)
    } finally {
      setLoading(false)
    }
  }, [token, limit, handleError])

  useEffect(() => {
    load()
  }, [load])

  const remove = useCallback(
    async (id) => {
      const before = meetings
      setMeetings((list) => list.filter((m) => m.id !== id)) // optimistic
      try {
        await api(`/users/history/${id}`, { method: 'DELETE', token })
      } catch (err) {
        setMeetings(before)
        handleError(err)
      }
    },
    [meetings, token, handleError]
  )

  const clearAll = useCallback(async () => {
    try {
      await api('/users/history', { method: 'DELETE', token })
      setMeetings([])
    } catch (err) {
      handleError(err)
    }
  }, [token, handleError])

  return { meetings, loading, error, reload: load, remove, clearAll }
}

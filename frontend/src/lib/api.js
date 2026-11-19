// Small fetch wrapper for the LinkUp API.
//
// Requests go to "/api/..." on the frontend's own domain. In development Vite proxies them to
// the backend (vite.config.js); in production Vercel does (vercel.json). Keeping the API on the
// same site means the httpOnly session cookie is first-party, which every browser accepts.
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin', // send the session cookie
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError("Can't reach the LinkUp server. Is the backend running?", 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.message || 'Something went wrong', res.status)
  return data
}

// The socket can't go through the proxy (WebSockets aren't rewritten), so it connects to the
// backend directly, authenticated with a one-time ticket from /auth/socket-ticket.
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

import './App.css'
import { Routes, Route, useLocation } from 'react-router-dom'
import Landing from './components/pages/landing/Landing.jsx'
import Navbar from './Navbar.jsx'
import Auth from './components/pages/auth/Authenticate.jsx'
import Setup from './components/pages/home/Setup.jsx'
import Call from './components/pages/call/Call.jsx'
import History from './components/pages/history/History.jsx'

function App() {
  const { pathname } = useLocation()

  return (
    <>
      {!pathname.startsWith('/call/') && <Navbar />}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/signup" element={<Auth mode="register" />} />
        <Route path="/new" element={<Setup mode="create" />} />
        <Route path="/join" element={<Setup mode="join" />} />
        <Route path="/call/:code" element={<Call />} />
        <Route path="/history" element={<History />} />
      </Routes>
    </>
  )
}

export default App
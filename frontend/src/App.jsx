import './App.css'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Landing from './components/pages/landing/Landing.jsx'
import Navbar from './Navbar.jsx'

// TODO: build these pages:
import Auth from './components/pages/auth/Authenticate.jsx'
// import Setup from './components/pages/home/Setup.jsx'
// import Call from './components/pages/call/Call.jsx'

function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/signup" element={<Auth mode="register" />} />
        {/* <Route path="/new" element={<Setup mode="create" />} /> */}
        {/* <Route path="/join" element={<Setup mode="join" />} /> */}
        {/* <Route path="/call/:code" element={<Call />} /> */}
      </Routes>
    </Router>
  )
}

export default App
import { useAuth } from "@/context/AuthContext.jsx"
import Hero from "./Hero.jsx"
import MeetingOptions from "./MeetingOptions.jsx"

export default function Landing() {
  const { isLoggedIn } = useAuth()
  return (
    <div className="bg-background">
      {isLoggedIn ? <MeetingOptions /> : <Hero />}
    </div>
  )
}
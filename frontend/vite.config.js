import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  // where /api is forwarded to during `npm run dev` and `npm run preview`
  const apiTarget = env.VITE_DEV_API || "http://localhost:3001"

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    // same-origin API in development too, so the session cookie works exactly like production
    server: { proxy: { "/api": { target: apiTarget } } },
    preview: { proxy: { "/api": { target: apiTarget } } },
  }
})

"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

const POLL_MS = 3000

// Chats are written by the user's AI tool over MCP, not from this page, so
// re-fetch the server data while the tab is visible to show new messages.
function ChatLiveRefresh() {
  const router = useRouter()

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh()
    }

    const timer = setInterval(refresh, POLL_MS)

    document.addEventListener("visibilitychange", refresh)

    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [router])

  return null
}

export { ChatLiveRefresh }

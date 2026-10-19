"use client"

import { MonitorIcon } from "lucide-react"

import { useToggleChatPanel } from "@/components/chat-panel"
import { Button } from "@/components/ui/button"

function ChatPanelToggle() {
  const toggle = useToggleChatPanel()

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle side panel"
      onClick={toggle}
    >
      <MonitorIcon />
    </Button>
  )
}

export { ChatPanelToggle }

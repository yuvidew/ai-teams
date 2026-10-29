"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { getConnectionStatus } from "@/actions/connection"
import { ConnectTabs, EXAMPLE_PROMPT } from "@/components/connect-tabs"
import { CopyBlock } from "@/components/copy-block"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const POLL_MS = 2000

// Opens over the app until the user's AI tool has connected. Bots are created
// and run from that tool (Claude Code, Codex or Cursor) over MCP. The layout
// stops rendering it once a connection exists.
function ConnectDialog({ mcpUrl }: { mcpUrl: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  useEffect(() => {
    let active = true

    const check = async () => {
      try {
        const { connected } = await getConnectionStatus()

        if (active && connected) router.refresh()
      } catch {
        // Try again on the next tick.
      }
    }

    const timer = setInterval(check, POLL_MS)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect your AI tool</DialogTitle>
          <DialogDescription>
            Your bots are created and run from your own AI tool, so there is no
            AI key to set up. Connect one below and this closes by itself.
          </DialogDescription>
        </DialogHeader>

        <ConnectTabs mcpUrl={mcpUrl} />

        <CopyBlock
          label="3. Then try it: ask your AI tool to create a bot and give it a task"
          value={EXAMPLE_PROMPT}
        />

        <p className="text-xs text-muted-foreground" aria-live="polite">
          Waiting for your AI tool to connect…
        </p>
      </DialogContent>
    </Dialog>
  )
}

export { ConnectDialog }

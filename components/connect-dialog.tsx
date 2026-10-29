"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { getConnectionStatus } from "@/actions/connection"
import { CopyBlock } from "@/components/copy-block"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const POLL_MS = 2000

const EXAMPLE_PROMPT =
  'Using the ai-teams tools, create a bot named "Ada" with the job "Research assistant", then in its sandbox open Chromium and search for "code with antino".'

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

  const cursorConfig = JSON.stringify(
    { mcpServers: { "ai-teams": { url: mcpUrl } } },
    null,
    2
  )

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

        <Tabs defaultValue="claude">
          <TabsList>
            <TabsTrigger value="claude">Claude Code</TabsTrigger>
            <TabsTrigger value="codex">Codex</TabsTrigger>
            <TabsTrigger value="cursor">Cursor</TabsTrigger>
          </TabsList>

          <TabsContent value="claude" className="flex flex-col gap-3 pt-2">
            <CopyBlock
              label="1. Add this app (run in a terminal)"
              value={`claude mcp add --transport http ai-teams ${mcpUrl}`}
            />
            <p className="text-sm">
              <span className="font-medium">2. Sign in.</span> In Claude Code
              run <code className="text-xs">/mcp</code>, pick{" "}
              <code className="text-xs">ai-teams</code> and choose Authenticate.
              Sign in with this account in the browser window.
            </p>
          </TabsContent>

          <TabsContent value="codex" className="flex flex-col gap-3 pt-2">
            <CopyBlock
              label="1. Add this app (run in a terminal)"
              value={`codex mcp add ai-teams --url ${mcpUrl}`}
            />
            <CopyBlock
              label="2. Sign in (opens a browser window)"
              value="codex mcp login ai-teams"
            />
          </TabsContent>

          <TabsContent value="cursor" className="flex flex-col gap-3 pt-2">
            <CopyBlock
              label="1. Add this to ~/.cursor/mcp.json"
              value={cursorConfig}
            />
            <p className="text-sm">
              <span className="font-medium">2. Sign in.</span> Open Cursor
              Settings, go to MCP, find <code className="text-xs">ai-teams</code>{" "}
              and choose Connect. Sign in with this account in the browser
              window.
            </p>
          </TabsContent>
        </Tabs>

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

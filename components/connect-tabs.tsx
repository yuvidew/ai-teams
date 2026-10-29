import { CopyBlock } from "@/components/copy-block"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const EXAMPLE_PROMPT =
  'Using the ai-teams tools, create a bot named "Ada" with the job "Research assistant", then in its sandbox open Chromium and search for "code with antino".'

// How to connect each AI tool to the MCP server, one tab per tool.
function ConnectTabs({ mcpUrl }: { mcpUrl: string }) {
  const cursorConfig = JSON.stringify(
    { mcpServers: { "ai-teams": { url: mcpUrl } } },
    null,
    2
  )

  return (
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
          <span className="font-medium">2. Sign in.</span> In Claude Code run{" "}
          <code className="text-xs">/mcp</code>, pick{" "}
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
          <span className="font-medium">2. Sign in.</span> Open Cursor Settings,
          go to MCP, find <code className="text-xs">ai-teams</code> and choose
          Connect. Sign in with this account in the browser window.
        </p>
      </TabsContent>
    </Tabs>
  )
}

export { ConnectTabs }

import { CopyBlock } from "@/components/copy-block"

// A bot is driven from the user's AI tool over MCP, so its chat page explains
// how, and the desktop panel beside it shows the bot at work.
function BotGuide({ botId, name }: { botId: string; name: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6">
      <div className="flex w-full max-w-lg flex-col gap-1.5 text-center">
        <h2 className="text-base font-medium">Give {name} a task</h2>
        <p className="text-sm text-muted-foreground">
          Bots are run from your connected AI tool (Claude Code, Codex or
          Cursor). Ask it to take on this bot. Open the desktop panel to watch
          it work.
        </p>
      </div>
      <div className="w-full max-w-lg">
        <CopyBlock
          label="Say this in your AI tool"
          value={`Use the ai-teams bot "${name}" (id ${botId}): call get_bot to take on its role, then do this task in its sandbox: `}
        />
      </div>
    </div>
  )
}

export { BotGuide }

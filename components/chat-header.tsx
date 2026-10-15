import { MonitorIcon } from "lucide-react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import type { ChatDetail } from "@/queries/chats"

function ChatHeader({ chat }: { chat: ChatDetail }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <BotDialog bot={chat.bot}>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChatAvatar seed={chat.bot.avatar} className="size-8" />
          <span className="truncate text-sm font-medium">{chat.bot.name}</span>
        </button>
      </BotDialog>
      <Button variant="ghost" size="icon" aria-label="Edit bot">
        <MonitorIcon />
      </Button>
    </header>
  )
}

export { ChatHeader }

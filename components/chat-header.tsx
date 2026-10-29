import { ChatAvatar } from "@/components/chat-avatar"
import { ChatPanelToggle } from "@/components/chat-panel-toggle"
import type { ChatDetail } from "@/queries/chats"

function ChatHeader({ chat }: { chat: ChatDetail }) {
  const bot = chat.bots[0]

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ChatAvatar seed={bot.avatar} className="size-8" />
        <span className="truncate text-sm font-medium">{bot.name}</span>
      </div>
      <ChatPanelToggle />
    </header>
  )
}

export { ChatHeader }

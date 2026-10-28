import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { Chat } from "@/components/chat"
import { ChatHeader } from "@/components/chat-header"
import { VncPreview, VncProvider } from "@/components/vnc"
import { ChatPanel, ChatPanelProvider } from "@/components/chat-panel"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { hasFeatures } from "@/lib/billing"
import { getChat } from "@/queries/chats"

export default async function ChatPage({
  params,
}: PageProps<"/chats/[chatId]">) {
  await auth.protect()

  const { chatId } = await params
  const chat = await getChat(chatId)

  if (!chat) notFound()

  const canChat = await hasFeatures("bots", "sandboxes")

  // Group chats have no desktop, so no side panel either.
  if (chat.kind === "group") {
    return (
      <div className="flex h-svh min-h-0 flex-col overflow-hidden">
        <ChatHeader chat={chat} />
        <Chat chatId={chat.id} bots={chat.bots} canChat={canChat} />
      </div>
    )
  }

  return (
    <ChatPanelProvider>
      <VncProvider chatId={chat.id}>
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-svh overflow-hidden has-data-[separator=active]:*:transition-none"
        >
          <ResizablePanel minSize="30%" className="overflow-hidden">
            <div className="flex h-svh min-h-0 flex-col">
              <ChatHeader chat={chat} />
              <Chat chatId={chat.id} bots={chat.bots} canChat={canChat} />
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ChatPanel>
            <VncPreview name={chat.name} />
          </ChatPanel>
        </ResizablePanelGroup>
      </VncProvider>
    </ChatPanelProvider>
  )
}

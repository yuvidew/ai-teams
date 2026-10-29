import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { BotGuide } from "@/components/bot-guide"
import { ChatHeader } from "@/components/chat-header"
import { VncPreview, VncProvider } from "@/components/vnc"
import { ChatPanel, ChatPanelProvider } from "@/components/chat-panel"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { getChat } from "@/queries/chats"

export default async function ChatPage({
  params,
}: PageProps<"/chats/[chatId]">) {
  await auth.protect()

  const { chatId } = await params
  const chat = await getChat(chatId)

  if (!chat) notFound()

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
              <BotGuide botId={chat.bots[0].id} name={chat.name} />
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

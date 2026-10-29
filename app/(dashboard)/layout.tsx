import { auth } from "@clerk/nextjs/server"
import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { ChatLiveRefresh } from "@/components/chat-live-refresh"
import { ConnectDialog } from "@/components/connect-dialog"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { hasConnected } from "@/lib/mcp-connection"
import { getMcpUrl } from "@/lib/mcp-url"
import { getUserChats } from "@/queries/bots"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { userId } = await auth()
  const [chats, cookieStore, connected] = await Promise.all([
    getUserChats(),
    cookies(),
    userId ? hasConnected(userId) : true,
  ])
  // SidebarProvider writes this cookie on every toggle; absent means open.
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  // Bots are answered by the user's own AI tool, so until one has connected the
  // app opens with a dialog on how to connect it. Once connected, no dialog.
  const mcpUrl = connected ? null : await getMcpUrl()

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar chats={chats} />
      <SidebarInset>
        <ChatLiveRefresh />
        {children}
      </SidebarInset>
      {mcpUrl && <ConnectDialog mcpUrl={mcpUrl} />}
    </SidebarProvider>
  )
}

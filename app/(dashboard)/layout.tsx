import { auth } from "@clerk/nextjs/server"
import { cookies, headers } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { ConnectDialog } from "@/components/connect-dialog"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { hasConnected } from "@/lib/mcp-connection"
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
  let mcpUrl: string | null = null

  if (!connected) {
    const requestHeaders = await headers()
    const host =
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
    const protocol =
      requestHeaders.get("x-forwarded-proto") ??
      (host?.startsWith("localhost") ? "http" : "https")

    mcpUrl = `${protocol}://${host}/api/mcp`
  }

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar chats={chats} />
      <SidebarInset>{children}</SidebarInset>
      {mcpUrl && <ConnectDialog mcpUrl={mcpUrl} />}
    </SidebarProvider>
  )
}

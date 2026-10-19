import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { getUserBots, getUserChats } from "@/queries/bots"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [chats, bots, cookieStore] = await Promise.all([
    getUserChats(),
    getUserBots(),
    cookies(),
  ])
  // SidebarProvider writes this cookie on every toggle; absent means open.
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar chats={chats} bots={bots} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}

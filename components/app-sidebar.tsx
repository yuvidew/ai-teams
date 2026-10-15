import { UserButton } from "@clerk/nextjs"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarContent></SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Clerk renders its own <button>, so the menu button is a div to avoid nesting buttons. */}
            <SidebarMenuButton size="lg" className="p-0!" render={<div />}>
              <UserButton
                showName
                appearance={{
                  elements: {
                    rootBox: "size-full!",
                    userButtonBox: "w-full! flex-row-reverse! justify-end! gap-2!",
                    userButtonTrigger:
                      "size-full! justify-start! rounded-md! bg-transparent! p-2! shadow-none! hover:bg-transparent! focus:bg-transparent! focus-visible:shadow-none!",
                    userButtonOuterIdentifier:
                      "truncate! p-0! text-sm! text-sidebar-foreground! group-data-[collapsible=icon]:hidden!",
                    userButtonAvatarBox: "size-6!",
                    userButtonAvatarImage: "size-6!",
                  },
                }}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

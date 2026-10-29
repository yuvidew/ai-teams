"use client"

import * as React from "react"
import { UserButton } from "@clerk/nextjs"
import { formatDistanceToNowStrict } from "date-fns"
import { SearchIcon } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { SidebarChat } from "@/queries/bots"

const subscribeNothing = () => () => {}

// "⌘" on Apple platforms, "Ctrl" elsewhere. Server render assumes non-Apple.
function useModifierKey() {
  const isApple = React.useSyncExternalStore(
    subscribeNothing,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false
  )

  return isApple ? "⌘" : "Ctrl"
}

function ChatRow({ chat }: { chat: SidebarChat }) {
  return (
    <>
      <ChatAvatar
        seed={chat.avatars[0]}
        className="size-8 group-data-[collapsible=icon]:size-6"
      />
      <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{chat.name}</span>
          <span
            suppressHydrationWarning
            className="shrink-0 text-xs text-muted-foreground"
          >
            {formatDistanceToNowStrict(chat.lastMessageAt)}
          </span>
        </div>

        <span className="truncate text-xs text-muted-foreground">
          {chat.lastMessagePreview
            ? chat.lastMessagePreview
            : "no messages yet"}
        </span>
      </div>
    </>
  )
}

export function AppSidebar({ chats }: { chats: SidebarChat[] }) {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const modifierKey = useModifierKey()
  const router = useRouter()
  const { chatId } = useParams<{ chatId?: string }>()
  const { state, isMobile } = useSidebar()
  // Header buttons only need a label once their text is hidden.
  const tooltipHidden = state !== "collapsed" || isMobile

  // Cmd/Ctrl + K toggles the search dialog.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/*  */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                onClick={() => setSearchOpen(true)}
                className="h-8 w-full min-w-0 justify-start rounded-lg border border-input bg-transparent px-2.5 py-1 text-base font-normal text-muted-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:text-foreground md:text-sm dark:bg-input/30 group-data-[collapsible=icon]:dark:bg-transparent group-data-[collapsible=icon]:dark:hover:bg-muted/50"
              />
            }
          >
            <SearchIcon data-icon="inline-start" />
            <span className="group-data-[collapsible=icon]:hidden">Search</span>
            <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">
              {modifierKey} K
            </Kbd>
          </TooltipTrigger>
          <TooltipContent side="right" hidden={tooltipHidden}>
            Search
          </TooltipContent>
        </Tooltip>
        <CommandDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          title="Search chats"
          description="Search your chats by bot name or message."
        >
          <Command>
            <CommandInput placeholder="Search chats..." />
            <CommandList>
              <CommandEmpty>No chats found.</CommandEmpty>
              <CommandGroup heading="Chats">
                {chats.map((chat) => (
                  <CommandItem
                    key={chat.id}
                    value={chat.id}
                    keywords={[chat.name, chat.lastMessagePreview ?? ""]}
                    onSelect={() => {
                      setSearchOpen(false)
                      router.push(`/chats/${chat.id}`)
                    }}
                  >
                    <ChatRow chat={chat} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </CommandDialog>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {chats.map((chat) => (
              <SidebarMenuItem key={chat.id}>
                <SidebarMenuButton
                  tooltip={chat.name}
                  isActive={chat.id === chatId}
                  className="h-auto items-start gap-3 py-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                  render={
                    <Link
                      href={`/chats/${chat.id}`}
                      aria-current={chat.id === chatId ? "page" : undefined}
                    />
                  }
                >
                  <ChatRow chat={chat} />
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
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
                    userButtonBox:
                      "w-full! flex-row-reverse! justify-end! gap-2! group-data-[collapsible=icon]:justify-center!",
                    userButtonTrigger:
                      "size-full! justify-start! rounded-md! bg-transparent! p-2! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0! shadow-none! hover:bg-transparent! focus:bg-transparent! focus-visible:shadow-none!",
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
      <SidebarRail />
    </Sidebar>
  )
}

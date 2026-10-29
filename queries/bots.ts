import { auth } from "@clerk/nextjs/server"
import { asc, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { chats } from "@/db/schema"

export type SidebarChat = {
  id: string
  kind: "direct" | "group"
  name: string
  // One seed per member, in join order. A direct chat has exactly one.
  avatars: string[]
  lastMessagePreview: string | null
  lastMessageAt: Date
}

// The signed-in user's chats, newest activity first. Scoped to the Clerk
// userId, so one user can never see another's chats.
export async function getUserChats(): Promise<SidebarChat[]> {
  const { userId } = await auth()

  if (!userId) return []

  const rows = await db.query.chats.findMany({
    where: eq(chats.userId, userId),
    orderBy: desc(chats.lastMessageAt),
    with: {
      members: {
        orderBy: (members) => asc(members.joinedAt),
        with: { bot: { columns: { name: true, avatar: true } } },
      },
    },
  })

  return rows.flatMap((chat) => {
    const members = chat.members.map((member) => member.bot)

    if (members.length === 0) return []

    return {
      id: chat.id,
      kind: chat.kind,
      name:
        chat.kind === "group" ? (chat.name ?? "Group chat") : members[0].name,
      avatars: members.map((bot) => bot.avatar),
      lastMessagePreview: chat.lastMessagePreview,
      lastMessageAt: chat.lastMessageAt,
    }
  })
}

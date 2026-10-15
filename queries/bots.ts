import { auth } from "@clerk/nextjs/server"
import { asc, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { chats } from "@/db/schema"

export type SidebarChat = {
  id: string
  name: string
  avatar: string
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
        limit: 1, // group chats fall back to their first bot for now
        with: { bot: { columns: { name: true, avatar: true } } },
      },
    },
  })

  return rows.flatMap((chat) => {
    const bot = chat.members[0]?.bot

    if (!bot) return []

    return {
      id: chat.id,
      name: bot.name,
      avatar: bot.avatar,
      lastMessagePreview: chat.lastMessagePreview,
      lastMessageAt: chat.lastMessageAt,
    }
  })
}

import { auth } from "@clerk/nextjs/server"
import { and, asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { chats } from "@/db/schema"

export type ChatDetail = {
  id: string
  bot: {
    id: string
    name: string
    job: string
    instructions: string | null
    avatar: string
  }
}

// One of the signed-in user's chats, or null if it doesn't exist or belongs to
// someone else. Scoped to the Clerk userId, same as getUserChats.
export async function getChat(chatId: string): Promise<ChatDetail | null> {
  const { userId } = await auth()

  if (!userId) return null

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    with: {
      members: {
        orderBy: (members) => asc(members.joinedAt),
        limit: 1, // group chats fall back to their first bot for now
        with: {
          bot: {
            columns: {
              id: true,
              name: true,
              job: true,
              instructions: true,
              avatar: true,
            },
          },
        },
      },
    },
  })

  const bot = chat?.members[0]?.bot

  if (!chat || !bot) return null

  return { id: chat.id, bot }
}

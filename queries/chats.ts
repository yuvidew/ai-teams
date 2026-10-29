import { auth } from "@clerk/nextjs/server"
import { and, asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { chatMessages, chats } from "@/db/schema"

export type ChatBot = {
  id: string
  name: string
  job: string
  instructions: string | null
  avatar: string
}

export type ChatDetail = {
  id: string
  kind: "direct" | "group"
  // The bot's name for a direct chat, the group's name for a group chat.
  name: string
  // Direct chats have exactly one; group chats have two or more.
  bots: ChatBot[]
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

  const chatBots = chat?.members.map((member) => member.bot) ?? []

  if (!chat || chatBots.length === 0) return null

  return {
    id: chat.id,
    kind: chat.kind,
    name:
      chat.kind === "group" ? (chat.name ?? "Group chat") : chatBots[0].name,
    bots: chatBots,
  }
}

export type ChatMessageRow = {
  id: string
  // The bot that wrote it; null means the user did.
  botId: string | null
  mentions: string[]
  content: string
  createdAt: Date
}

// The chat's transcript, oldest first. Scoped to the signed-in user.
export async function getChatMessages(
  chatId: string
): Promise<ChatMessageRow[]> {
  const { userId } = await auth()

  if (!userId) return []

  const [chat] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))

  if (!chat) return []

  return db
    .select({
      id: chatMessages.id,
      botId: chatMessages.botId,
      mentions: chatMessages.mentions,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(asc(chatMessages.createdAt))
}

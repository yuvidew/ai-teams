import { and, asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { chatMembers } from "@/db/schema"

const botColumns = {
  id: true,
  name: true,
  job: true,
  instructions: true,
  sandboxId: true,
} as const

export type ChatBotRecord = {
  id: string
  name: string
  job: string
  instructions: string | null
  sandboxId: string | null
}

// Not scoped to a user: the chat id only reaches a run through
// actions/chat.ts, which checks ownership first.

/** Every bot in a chat, in join order. A direct chat has exactly one. */
export async function getChatBots(chatId: string): Promise<ChatBotRecord[]> {
  const members = await db.query.chatMembers.findMany({
    where: eq(chatMembers.chatId, chatId),
    orderBy: asc(chatMembers.joinedAt),
    with: { bot: { columns: botColumns } },
  })

  return members.map((member) => member.bot)
}

/**
 * The bot that answers a turn. Group chats pick one per message (`botId`); it
 * is only honoured if that bot is a member of this chat, so a tampered id falls
 * back to the chat's first bot.
 */
export async function getChatBot(
  chatId: string,
  botId?: string
): Promise<ChatBotRecord | null> {
  if (botId) {
    const member = await db.query.chatMembers.findFirst({
      where: and(eq(chatMembers.chatId, chatId), eq(chatMembers.botId, botId)),
      with: { bot: { columns: botColumns } },
    })

    if (member) return member.bot
  }

  return (await getChatBots(chatId))[0] ?? null
}

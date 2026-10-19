"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { nanoid } from "nanoid"

import { db } from "@/db"
import { bots, chatMembers, chats, insertGroupChatSchema } from "@/db/schema"

type CreateGroupChatResult =
  { success: true; id: string } | { success: false; error: string }

export async function createGroupChat(
  input: unknown
): Promise<CreateGroupChatResult> {
  const { userId } = await auth()

  if (!userId) {
    return {
      success: false,
      error: "You must be signed in to create a group chat.",
    }
  }

  const parsed = insertGroupChatSchema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid group chat.",
    }
  }

  const { name, botIds } = parsed.data
  const uniqueBotIds = [...new Set(botIds)]

  // Only the user's own bots can join; anything else is rejected outright.
  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.userId, userId), inArray(bots.id, uniqueBotIds)))

  if (owned.length !== uniqueBotIds.length || uniqueBotIds.length < 2) {
    return { success: false, error: "Pick at least two of your bots." }
  }

  const chatId = nanoid()

  await db.batch([
    db.insert(chats).values({ id: chatId, userId, kind: "group", name }),
    db
      .insert(chatMembers)
      .values(uniqueBotIds.map((botId) => ({ chatId, botId }))),
  ])

  revalidatePath("/", "layout")

  return { success: true, id: chatId }
}

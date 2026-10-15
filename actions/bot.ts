"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { nanoid } from "nanoid"

import { db } from "@/db"
import { bots, chatMembers, chats, insertBotSchema } from "@/db/schema"

type CreateBotResult =
  | { success: true; id: string }
  | { success: false; error: string }

export async function createBot(input: unknown): Promise<CreateBotResult> {
  const { userId } = await auth()

  if (!userId) {
    return { success: false, error: "You must be signed in to create a bot." }
  }

  const parsed = insertBotSchema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid bot.",
    }
  }

  const { instructions, ...values } = parsed.data

  // Ids are generated up front so the three inserts can reference each other
  // inside a single batch (one round trip, executed atomically).
  const botId = nanoid()
  const chatId = nanoid()

  await db.batch([
    db
      .insert(bots)
      .values({ ...values, id: botId, instructions: instructions || null, userId }),
    db.insert(chats).values({ id: chatId, userId, kind: "direct" }),
    db.insert(chatMembers).values({ chatId, botId }),
  ])

  revalidatePath("/")

  return { success: true, id: botId }
}

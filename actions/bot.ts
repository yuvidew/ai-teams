"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { nanoid } from "nanoid"

import { db } from "@/db"
import { bots, chatMembers, chats, insertBotSchema } from "@/db/schema"

type CreateBotResult =
  { success: true; id: string } | { success: false; error: string }

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
    db.insert(bots).values({
      ...values,
      id: botId,
      instructions: instructions || null,
      userId,
    }),
    db.insert(chats).values({ id: chatId, userId, kind: "direct" }),
    db.insert(chatMembers).values({ chatId, botId }),
  ])

  revalidatePath("/")

  return { success: true, id: botId }
}

type UpdateBotResult = { success: true } | { success: false; error: string }

export async function updateBot(
  botId: string,
  input: unknown
): Promise<UpdateBotResult> {
  const { userId } = await auth()

  if (!userId) {
    return { success: false, error: "You must be signed in to edit a bot." }
  }

  const parsed = insertBotSchema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid bot.",
    }
  }

  const { instructions, ...values } = parsed.data

  // Scoped to the Clerk user, so someone else's bot id updates nothing.
  const updated = await db
    .update(bots)
    .set({ ...values, instructions: instructions || null })
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    .returning({ id: bots.id })

  if (updated.length === 0) {
    return { success: false, error: "Bot not found." }
  }

  // Bot names and avatars show in the sidebar and chat headers.
  revalidatePath("/", "layout")

  return { success: true }
}

export async function deleteBot(botId: string): Promise<UpdateBotResult> {
  const { userId } = await auth()

  if (!userId) {
    return { success: false, error: "You must be signed in to delete a bot." }
  }

  const [bot] = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))

  if (!bot) {
    return { success: false, error: "Bot not found." }
  }

  // Direct chats only exist for their bot, so they go with it (members cascade
  // from the chat). Group chats stay; the bot just drops out via the cascade
  // on chat_members.bot_id. Chats first: deleting the bot removes the member
  // rows this lookup relies on.
  await db.batch([
    db
      .delete(chats)
      .where(
        and(
          eq(chats.userId, userId),
          eq(chats.kind, "direct"),
          inArray(
            chats.id,
            db
              .select({ id: chatMembers.chatId })
              .from(chatMembers)
              .where(eq(chatMembers.botId, botId))
          )
        )
      ),
    db.delete(bots).where(and(eq(bots.id, botId), eq(bots.userId, userId))),
  ])

  revalidatePath("/", "layout")

  return { success: true }
}

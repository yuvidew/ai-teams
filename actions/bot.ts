"use server"

import { auth } from "@clerk/nextjs/server"
import { and, count, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { nanoid } from "nanoid"

import { db } from "@/db"
import { bots, chatMembers, chats, insertBotSchema } from "@/db/schema"
import { hasFeatures, UPGRADE_MESSAGE } from "@/lib/billing"
import { PRO_LIMITS } from "@/lib/usage-limits"
import { syncUsageAccount } from "@/lib/usage-sync"
import { createBotSandbox, deleteBotSandbox } from "@/lib/daytona"

type CreateBotResult =
  | { success: true; id: string }
  | { success: false; error: string; upgrade?: true; limit?: true }

export async function createBot(input: unknown): Promise<CreateBotResult> {
  const { userId } = await auth()

  if (!userId) {
    return { success: false, error: "You must be signed in to create a bot." }
  }

  // A bot comes with its own sandbox, so it needs both features.
  if (!(await hasFeatures("bots", "sandboxes"))) {
    return { success: false, error: UPGRADE_MESSAGE, upgrade: true }
  }

  // Every bot owns a sandbox, so the plan caps how many there can be.
  await syncUsageAccount(userId)
  const [{ total }] = await db
    .select({ total: count() })
    .from(bots)
    .where(eq(bots.userId, userId))

  if (total >= PRO_LIMITS.bots) {
    return {
      success: false,
      error: `Pro includes up to ${PRO_LIMITS.bots} bots. Delete one to create another.`,
      limit: true,
    }
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

  let sandboxId: string
  try {
    sandboxId = await createBotSandbox(botId)
  } catch (error) {
    console.error("Failed to create sandbox", error)
    return { success: false, error: "Could not create the bot's sandbox." }
  }

  try {
    await db.batch([
      db.insert(bots).values({
        ...values,
        id: botId,
        instructions: instructions || null,
        sandboxId,
        userId,
      }),
      db.insert(chats).values({ id: chatId, userId, kind: "direct" }),
      db.insert(chatMembers).values({ chatId, botId }),
    ])
  } catch (error) {
    // Don't leave an orphaned sandbox behind.
    await deleteBotSandbox(sandboxId).catch(() => {})
    throw error
  }

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
    .select({ id: bots.id, sandboxId: bots.sandboxId })
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

  if (bot.sandboxId) {
    try {
      await deleteBotSandbox(bot.sandboxId)
    } catch (error) {
      // The bot is already gone; surface the leak without failing the delete.
      console.error(`Failed to delete sandbox ${bot.sandboxId}`, error)
    }
  }

  revalidatePath("/", "layout")

  return { success: true }
}

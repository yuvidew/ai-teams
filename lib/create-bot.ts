import { count, eq } from "drizzle-orm"
import { nanoid } from "nanoid"

import { db } from "@/db"
import { bots, chatMembers, chats, insertBotSchema } from "@/db/schema"
import { createBotSandbox, deleteBotSandbox } from "@/lib/daytona"
import { PRO_LIMITS } from "@/lib/usage-limits"
import { syncUsageAccount } from "@/lib/usage-sync"

export type CreateBotResult =
  | { success: true; id: string }
  | { success: false; error: string; upgrade?: true; limit?: true }

export const UPGRADE_TO_CREATE =
  "Your free plan doesn't include this. Upgrade to Pro to unlock bots and sandboxes."

/**
 * Creates a bot with its sandbox and its chat for `userId`. Shared by the web
 * form and the MCP `create_bot` tool, so both enforce the same plan and limits.
 * The plan is read from the user's mirrored Clerk subscription, so it works
 * without a Clerk session.
 */
export async function createBotForUser(
  userId: string,
  input: unknown
): Promise<CreateBotResult> {
  // A bot comes with its own sandbox, so it needs the Pro plan.
  const account = await syncUsageAccount(userId)

  if (!account?.entitled) {
    return { success: false, error: UPGRADE_TO_CREATE, upgrade: true }
  }

  // Every bot owns a sandbox, so the plan caps how many there can be.
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

  return { success: true, id: botId }
}

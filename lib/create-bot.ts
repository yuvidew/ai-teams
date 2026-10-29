import { nanoid } from "nanoid"

import { db } from "@/db"
import { bots, chatMembers, chats, insertBotSchema } from "@/db/schema"
import { createBotSandbox, deleteBotSandbox } from "@/lib/daytona"

export type CreateBotResult =
  | { success: true; id: string }
  | { success: false; error: string }

/**
 * Creates a bot with its sandbox and its chat for `userId`. Shared by the web
 * form and the MCP `create_bot` tool.
 */
export async function createBotForUser(
  userId: string,
  input: unknown
): Promise<CreateBotResult> {
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

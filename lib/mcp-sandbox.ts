import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { bots } from "@/db/schema"
import { getStartedSandbox } from "@/lib/daytona"
import {
  createSandboxTools,
  type SandboxTools,
} from "@/lib/sandbox-tools"

// The sandbox tools, kept per bot so the desktop is only started once.
const toolsByBot = new Map<string, SandboxTools>()

/** The user's bot, or null. Scoped to the owner, so other users' ids miss. */
export async function getOwnedBot(userId: string, botId: string) {
  return (
    (await db.query.bots.findFirst({
      where: and(eq(bots.id, botId), eq(bots.userId, userId)),
    })) ?? null
  )
}

export async function getBotSandboxTools(userId: string, botId: string) {
  const key = `${userId}:${botId}`
  let tools = toolsByBot.get(key)

  if (!tools) {
    tools = createSandboxTools(async () => {
      const bot = await getOwnedBot(userId, botId)

      if (!bot) throw new Error("Bot not found.")
      if (!bot.sandboxId) throw new Error("This bot has no sandbox.")

      return getStartedSandbox(bot.sandboxId)
    })
    toolsByBot.set(key, tools)
  }

  return tools
}

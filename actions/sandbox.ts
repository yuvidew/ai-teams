"use server"

import { auth } from "@clerk/nextjs/server"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { bots } from "@/db/schema"
import { hasFeatures, UPGRADE_MESSAGE } from "@/lib/billing"
import { getSandboxVncUrl, refreshSandboxActivity } from "@/lib/daytona"
import { UsageLimitError, chargeSandbox } from "@/lib/usage"
import { syncUsageAccount } from "@/lib/usage-sync"
import { getChat } from "@/queries/chats"

type Failure = { success: false; error: string; upgrade?: true; limit?: true }
type VncResult = { success: true; url: string } | Failure
type HeartbeatResult = { success: true } | Failure

/**
 * Checks the plan and allowance and bills the chat bot's sandbox for the time
 * it is about to run. Returns the sandbox id to use.
 */
async function chargeChatSandbox(
  chatId: string
): Promise<{ success: true; sandboxId: string } | Failure> {
  const { userId } = await auth()

  if (!userId) return { success: false, error: "You must be signed in." }

  if (!(await hasFeatures("sandboxes"))) {
    return { success: false, error: UPGRADE_MESSAGE, upgrade: true }
  }

  // getChat is scoped to the signed-in user, so this doubles as the auth check.
  const chat = await getChat(chatId)

  if (!chat) return { success: false, error: "Chat not found." }

  // Group chats have no desktop panel.
  if (chat.kind === "group") {
    return { success: false, error: "Group chats have no screen." }
  }

  const botId = chat.bots[0].id
  const [bot] = await db
    .select({ sandboxId: bots.sandboxId })
    .from(bots)
    .where(eq(bots.id, botId))

  if (!bot?.sandboxId) {
    return { success: false, error: "This bot has no sandbox." }
  }

  try {
    await syncUsageAccount(userId)
    await chargeSandbox(userId, botId, chatId)
  } catch (error) {
    if (error instanceof UsageLimitError) {
      return { success: false, error: error.message, limit: true }
    }
    throw error
  }

  return { success: true, sandboxId: bot.sandboxId }
}

/** Starts the chat bot's desktop and returns the URL of its VNC session. */
export async function getChatVncUrl(chatId: string): Promise<VncResult> {
  const charged = await chargeChatSandbox(chatId)

  if (!charged.success) return charged

  try {
    return { success: true, url: await getSandboxVncUrl(charged.sandboxId) }
  } catch (error) {
    console.error("Failed to start VNC", error)
    return { success: false, error: "Could not start the sandbox's screen." }
  }
}

/**
 * Called while the screen is open: keeps the sandbox awake and bills the time,
 * or reports that the allowance ran out so the screen can be closed.
 */
export async function keepSandboxAlive(
  chatId: string
): Promise<HeartbeatResult> {
  const charged = await chargeChatSandbox(chatId)

  if (!charged.success) return charged

  try {
    await refreshSandboxActivity(charged.sandboxId)
    return { success: true }
  } catch (error) {
    console.error("Failed to refresh sandbox", error)
    return { success: false, error: "Could not reach the sandbox." }
  }
}

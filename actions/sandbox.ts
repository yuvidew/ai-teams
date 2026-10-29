"use server"

import { auth } from "@clerk/nextjs/server"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { bots } from "@/db/schema"
import { getSandboxVncUrl, refreshSandboxActivity } from "@/lib/daytona"
import { getChat } from "@/queries/chats"

type Failure = { success: false; error: string }
type VncResult = { success: true; url: string } | Failure
type HeartbeatResult = { success: true } | Failure

/** Finds the sandbox id of the signed-in user's direct chat bot. */
async function getChatSandboxId(
  chatId: string
): Promise<{ success: true; sandboxId: string } | Failure> {
  const { userId } = await auth()

  if (!userId) return { success: false, error: "You must be signed in." }

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

  return { success: true, sandboxId: bot.sandboxId }
}

/** Starts the chat bot's desktop and returns the URL of its VNC session. */
export async function getChatVncUrl(chatId: string): Promise<VncResult> {
  const found = await getChatSandboxId(chatId)

  if (!found.success) return found

  try {
    return { success: true, url: await getSandboxVncUrl(found.sandboxId) }
  } catch (error) {
    console.error("Failed to start VNC", error)
    return { success: false, error: "Could not start the sandbox's screen." }
  }
}

/** Called while the screen is open: keeps the sandbox awake. */
export async function keepSandboxAlive(
  chatId: string
): Promise<HeartbeatResult> {
  const found = await getChatSandboxId(chatId)

  if (!found.success) return found

  try {
    await refreshSandboxActivity(found.sandboxId)
    return { success: true }
  } catch (error) {
    console.error("Failed to refresh sandbox", error)
    return { success: false, error: "Could not reach the sandbox." }
  }
}

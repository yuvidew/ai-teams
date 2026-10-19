"use server"

import { eq } from "drizzle-orm"

import { db } from "@/db"
import { bots } from "@/db/schema"
import { getSandboxVncUrl } from "@/lib/daytona"
import { getChat } from "@/queries/chats"

type VncResult =
  { success: true; url: string } | { success: false; error: string }

/** Starts the chat bot's desktop and returns the URL of its VNC session. */
export async function getChatVncUrl(chatId: string): Promise<VncResult> {
  // getChat is scoped to the signed-in user, so this doubles as the auth check.
  const chat = await getChat(chatId)

  if (!chat) return { success: false, error: "Chat not found." }

  // Group chats have no desktop panel.
  if (chat.kind === "group") {
    return { success: false, error: "Group chats have no screen." }
  }

  const [bot] = await db
    .select({ sandboxId: bots.sandboxId })
    .from(bots)
    .where(eq(bots.id, chat.bots[0].id))

  if (!bot?.sandboxId) {
    return { success: false, error: "This bot has no sandbox." }
  }

  try {
    return { success: true, url: await getSandboxVncUrl(bot.sandboxId) }
  } catch (error) {
    console.error("Failed to start VNC", error)
    return { success: false, error: "Could not start the sandbox's screen." }
  }
}

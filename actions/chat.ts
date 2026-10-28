"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import {
  chat,
  defaultStorage,
  type ChatStartSessionParams,
} from "@trigger.dev/sdk/ai"

import { hasFeatures } from "@/lib/billing"
import { assertWithinLimit } from "@/lib/usage"
import { syncUsageAccount } from "@/lib/usage-sync"
import { getChat } from "@/queries/chats"
import type { aiChat, ChatUIMessage } from "@/trigger/chat"

const start = chat.createStartSessionAction<typeof aiChat>("ai-chat")
const load = chat.createLoadTranscriptAction(defaultStorage)

// The chat id comes from the browser, so every action checks that the signed-in
// user owns the chat before touching its session or transcript.
async function assertChatOwner(chatId: string) {
  if (!(await getChat(chatId))) throw new Error("Chat not found")

  // Talking to a bot runs it in its sandbox; both are paid features.
  if (!(await hasFeatures("bots", "sandboxes"))) {
    throw new Error("Upgrade to Pro to chat with bots.")
  }
}

export async function startChatSession(
  params: ChatStartSessionParams<typeof aiChat>
) {
  await assertCanRun(params.chatId)
  return start(params)
}

export async function mintChatAccessToken(chatId: string) {
  await assertCanRun(chatId)

  return triggerAuth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  })
}

// Starting or resuming a run also needs room left in this period's allowance.
// The run checks again on every turn; this just fails fast.
async function assertCanRun(chatId: string) {
  await assertChatOwner(chatId)

  const { userId } = await auth()
  if (!userId) throw new Error("Not signed in")

  await syncUsageAccount(userId)
  await assertWithinLimit(userId, "ai_tokens")
  await assertWithinLimit(userId, "sandbox_seconds")
}

type Transcript = Awaited<ReturnType<typeof load>>

// The stored messages are the agent's own, so they carry its typed tool parts.
export async function loadTranscript(
  params: Parameters<typeof load>[0]
): Promise<Omit<Transcript, "messages"> & { messages: ChatUIMessage[] }> {
  await assertChatOwner(params.chatId)
  const transcript = await load(params)

  return { ...transcript, messages: transcript.messages as ChatUIMessage[] }
}

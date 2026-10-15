"use server"

import { auth as triggerAuth } from "@trigger.dev/sdk"
import {
  chat,
  defaultStorage,
  type ChatStartSessionParams,
} from "@trigger.dev/sdk/ai"

import { getChat } from "@/queries/chats"
import type { aiChat } from "@/trigger/chat"

const start = chat.createStartSessionAction<typeof aiChat>("ai-chat")
const load = chat.createLoadTranscriptAction(defaultStorage)

// The chat id comes from the browser, so every action checks that the signed-in
// user owns the chat before touching its session or transcript.
async function assertChatOwner(chatId: string) {
  if (!(await getChat(chatId))) throw new Error("Chat not found")
}

export async function startChatSession(
  params: ChatStartSessionParams<typeof aiChat>
) {
  await assertChatOwner(params.chatId)
  return start(params)
}

export async function mintChatAccessToken(chatId: string) {
  await assertChatOwner(chatId)

  return triggerAuth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  })
}

export async function loadTranscript(params: Parameters<typeof load>[0]) {
  await assertChatOwner(params.chatId)
  return load(params)
}

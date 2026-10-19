import { mistral } from "@ai-sdk/mistral"
import { chat, type InferChatUIMessageFromTools } from "@trigger.dev/sdk/ai"
import { stepCountIs } from "ai"
import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { chatMembers } from "@/db/schema"
import { buildBotSystemPrompt } from "@/lib/bot-prompt"
import { getStartedSandbox } from "@/lib/daytona"
import { createSandboxTools, type SandboxTools } from "./sandbox-tools"

// The bot that answers a turn. Group chats pick one per message (`botId`); it
// is only honoured if that bot is a member of this chat, so a tampered id falls
// back to the chat's first bot. Not scoped to a user: the chat id only reaches
// this run through actions/chat.ts, which checks ownership first.
async function getChatBot(chatId: string, botId?: string) {
  const member = await db.query.chatMembers.findFirst({
    where: botId
      ? and(eq(chatMembers.chatId, chatId), eq(chatMembers.botId, botId))
      : eq(chatMembers.chatId, chatId),
    orderBy: asc(chatMembers.joinedAt),
    with: {
      bot: {
        columns: { name: true, job: true, instructions: true, sandboxId: true },
      },
    },
  })

  if (member || !botId) return member?.bot ?? null

  return getChatBot(chatId)
}

export type ChatUIMessage = InferChatUIMessageFromTools<SandboxTools>

// One long-lived run per chat. The transcript is kept by the default transcript
// storage, keyed by the chat id (which is also the session id).
export const aiChat = chat.withUIMessage<ChatUIMessage>().agent({
  id: "ai-chat",
  // Sent per message from the UI: which group member should answer.
  clientDataSchema: z.object({ botId: z.string().optional() }),
  // Resolved once per turn. The sandbox is only looked up (and woken) when a
  // tool actually runs.
  tools: ({ chatId, clientData }) => {
    let sandbox: ReturnType<typeof getStartedSandbox> | undefined

    return createSandboxTools(() => {
      sandbox ??= getChatBot(chatId, clientData?.botId).then((bot) => {
        if (!bot?.sandboxId) throw new Error("This bot has no sandbox.")
        return getStartedSandbox(bot.sandboxId)
      })
      // Don't cache a failure; the next tool call should try again.
      sandbox.catch(() => (sandbox = undefined))

      return sandbox
    })
  },
  run: async ({ chatId, clientData, messages, tools, signal, streamText }) => {
    const bot = await getChatBot(chatId, clientData?.botId)

    return streamText({
      // Vision-capable, so the agent can read its own screenshots. Medium and
      // small are rate limited to 0 requests/minute on our Mistral plan.
      model: mistral("ministral-14b-latest"),
      system: bot ? buildBotSystemPrompt(bot) : undefined,
      messages,
      tools,
      stopWhen: stepCountIs(40),
      abortSignal: signal,
    })
  },
})

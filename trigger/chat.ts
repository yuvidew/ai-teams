import { mistral } from "@ai-sdk/mistral"
import { chat, type InferChatUIMessageFromTools } from "@trigger.dev/sdk/ai"
import { stepCountIs } from "ai"
import { asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { chatMembers } from "@/db/schema"
import { buildBotSystemPrompt } from "@/lib/bot-prompt"
import { getStartedSandbox } from "@/lib/daytona"
import { createSandboxTools, type SandboxTools } from "./sandbox-tools"

// The bot behind a chat. Group chats fall back to their first bot, matching
// getChat in queries/chats.ts. Not scoped to a user: the chat id only reaches
// this run through actions/chat.ts, which checks ownership first.
async function getChatBot(chatId: string) {
  const member = await db.query.chatMembers.findFirst({
    where: eq(chatMembers.chatId, chatId),
    orderBy: asc(chatMembers.joinedAt),
    with: {
      bot: {
        columns: { name: true, job: true, instructions: true, sandboxId: true },
      },
    },
  })

  return member?.bot ?? null
}

export type ChatUIMessage = InferChatUIMessageFromTools<SandboxTools>

// One long-lived run per chat. The transcript is kept by the default transcript
// storage, keyed by the chat id (which is also the session id).
export const aiChat = chat.withUIMessage<ChatUIMessage>().agent({
  id: "ai-chat",
  // Resolved once per turn. The sandbox is only looked up (and woken) when a
  // tool actually runs.
  tools: ({ chatId }) => {
    let sandbox: ReturnType<typeof getStartedSandbox> | undefined

    return createSandboxTools(() => {
      sandbox ??= getChatBot(chatId).then((bot) => {
        if (!bot?.sandboxId) throw new Error("This bot has no sandbox.")
        return getStartedSandbox(bot.sandboxId)
      })
      // Don't cache a failure; the next tool call should try again.
      sandbox.catch(() => (sandbox = undefined))

      return sandbox
    })
  },
  run: async ({ chatId, messages, tools, signal, streamText }) => {
    const bot = await getChatBot(chatId)

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

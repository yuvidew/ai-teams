import { mistral } from "@ai-sdk/mistral"
import { chat } from "@trigger.dev/sdk/ai"
import {
  hasToolCall,
  stepCountIs,
  type InferUITools,
  type UIDataTypes,
  type UIMessage,
} from "ai"
import { z } from "zod"

import { buildBotSystemPrompt } from "@/lib/bot-prompt"
import { assertWithinLimit, recordUsage } from "@/lib/usage"
import { getChatBot, getChatBots, getChatOwner } from "./chat-bots"
import { createHandoffTool, type HandoffTool } from "./handoff-tool"
import { createMeteredSandbox } from "./metered-sandbox"
import { createSandboxTools, type SandboxTools } from "./sandbox-tools"
import { MAX_OUTPUT_TOKENS } from "./usage-guards"

// Assistant messages carry the id of the bot that wrote them, so group chats
// can show who said what.
export type ChatMessageMetadata = { botId?: string }

export type ChatUIMessage = UIMessage<
  ChatMessageMetadata,
  UIDataTypes,
  InferUITools<SandboxTools & { handoff: HandoffTool }>
>

// One long-lived run per chat. The transcript is kept by the default transcript
// storage, keyed by the chat id (which is also the session id).
export const aiChat = chat.withUIMessage<ChatUIMessage>().agent({
  id: "ai-chat",
  // Sent per message from the UI: which group member should answer.
  // Direct chats send no client data at all, so the whole object is optional.
  clientDataSchema: z.object({ botId: z.string().optional() }).optional(),
  // Resolved once per turn. The sandbox is only looked up (and woken) when a
  // tool actually runs, and every use is billed to the chat's owner.
  tools: ({ chatId, clientData }) => ({
    ...createSandboxTools(
      createMeteredSandbox(chatId, () => getChatBot(chatId, clientData?.botId))
    ),
    handoff: createHandoffTool(chatId, clientData?.botId),
  }),
  run: async ({ chatId, clientData, messages, tools, signal, streamText }) => {
    const [bot, bots, owner] = await Promise.all([
      getChatBot(chatId, clientData?.botId),
      getChatBots(chatId),
      getChatOwner(chatId),
    ])

    // Plan and allowance are enforced here too: a chat run outlives the page
    // that started it.
    if (!owner) throw new Error("Chat not found.")
    await assertWithinLimit(owner, "ai_tokens")
    const isGroup = bots.length > 1

    // Stamp the reply with the bot that is answering it.
    chat.setUIMessageStreamOptions({
      messageMetadata: ({ part }) =>
        part.type === "start" && bot ? { botId: bot.id } : undefined,
    })

    return streamText({
      // Vision-capable, so the agent can read its own screenshots. Medium and
      // small are rate limited to 0 requests/minute on our Mistral plan.
      model: mistral("ministral-14b-latest"),
      system: bot
        ? buildBotSystemPrompt(
            bot,
            isGroup
              ? { others: bots.filter((other) => other.id !== bot.id) }
              : undefined
          )
        : undefined,
      messages,
      tools,
      // Handing off only makes sense when there is someone to hand off to.
      activeTools: isGroup
        ? undefined
        : (Object.keys(tools) as (keyof typeof tools)[]).filter(
            (name) => name !== "handoff"
          ),
      // A handoff ends this bot's turn: the target bot answers inside the tool.
      stopWhen: [stepCountIs(40), hasToolCall("handoff")],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: signal,
      onStepFinish: async ({ usage }) => {
        await recordUsage(owner, "ai_tokens", usage.totalTokens ?? 0, {
          botId: bot?.id,
          chatId,
        })
      },
    })
  },
})

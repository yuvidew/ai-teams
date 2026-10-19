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
import { getStartedSandbox } from "@/lib/daytona"
import { getChatBot, getChatBots } from "./chat-bots"
import { createHandoffTool, type HandoffTool } from "./handoff-tool"
import { createSandboxTools, type SandboxTools } from "./sandbox-tools"

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
  clientDataSchema: z.object({ botId: z.string().optional() }),
  // Resolved once per turn. The sandbox is only looked up (and woken) when a
  // tool actually runs.
  tools: ({ chatId, clientData }) => {
    let sandbox: ReturnType<typeof getStartedSandbox> | undefined

    return {
      ...createSandboxTools(() => {
        sandbox ??= getChatBot(chatId, clientData?.botId).then((bot) => {
          if (!bot?.sandboxId) throw new Error("This bot has no sandbox.")
          return getStartedSandbox(bot.sandboxId)
        })
        // Don't cache a failure; the next tool call should try again.
        sandbox.catch(() => (sandbox = undefined))

        return sandbox
      }),
      handoff: createHandoffTool(chatId, clientData?.botId),
    }
  },
  run: async ({ chatId, clientData, messages, tools, signal, streamText }) => {
    const [bot, bots] = await Promise.all([
      getChatBot(chatId, clientData?.botId),
      getChatBots(chatId),
    ])
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
      abortSignal: signal,
    })
  },
})

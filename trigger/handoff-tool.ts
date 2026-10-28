import { mistral } from "@ai-sdk/mistral"
import { stepCountIs, streamText, tool } from "ai"
import { z } from "zod"

import { buildBotSystemPrompt } from "@/lib/bot-prompt"
import { recordUsage } from "@/lib/usage"
import { getChatBot, getChatBots, getChatOwner } from "./chat-bots"
import { createMeteredSandbox } from "./metered-sandbox"
import { createSandboxTools } from "./sandbox-tools"

import { MAX_OUTPUT_TOKENS } from "./usage-guards"

// Same model as the chat agent itself (see trigger/chat.ts).
const MODEL = "ministral-14b-latest"

type Output =
  { botId: string; botName: string; reply: string } | { error: string }

/**
 * Lets a bot in a group chat pass the user's request to another bot. The target
 * bot answers right here, as part of the tool call, with its own persona and its
 * own sandbox, and the caller's turn ends (see `hasToolCall` in trigger/chat.ts).
 * The reply streams in as preliminary tool output. The target gets no handoff
 * tool of its own, so a handoff is always a single hop.
 */
export function createHandoffTool(chatId: string, callerBotId?: string) {
  return tool({
    description:
      "Hand the user's latest request over to another bot in this group chat, when it is clearly better suited to that bot's job than to yours. The other bot answers the user directly, and your turn ends, so do not write the answer yourself and do not use this just because a request is hard. Only the bots listed in your group are valid.",
    inputSchema: z.object({
      botName: z
        .string()
        .min(1)
        .describe(
          "Name of the bot to hand off to, exactly as listed in your group"
        ),
      reason: z
        .string()
        .min(1)
        .describe("One short sentence on why that bot is the better fit"),
    }),
    async *execute({ botName, reason }, { messages, abortSignal }) {
      const [caller, bots] = await Promise.all([
        getChatBot(chatId, callerBotId),
        getChatBots(chatId),
      ])
      const others = bots.filter((bot) => bot.id !== caller?.id)
      const target = others.find(
        (bot) => bot.name.toLowerCase() === botName.trim().toLowerCase()
      )

      if (!target) {
        yield {
          error: `There is no bot named "${botName}" in this group. Choose one of: ${others.map((bot) => bot.name).join(", ")}.`,
        } satisfies Output
        return
      }

      const result = streamText({
        model: mistral(MODEL),
        system: buildBotSystemPrompt(target, {
          others: bots.filter((bot) => bot.id !== target.id),
          handoff: { from: caller?.name ?? "another bot", reason },
        }),
        messages,
        tools: createSandboxTools(
          createMeteredSandbox(chatId, async () => target)
        ),
        stopWhen: stepCountIs(40),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal,
        // Per step, so a stopped generation is still billed. The target's tokens
        // are on the chat owner's tab too.
        onStepFinish: async ({ usage }) => {
          const owner = await getChatOwner(chatId)
          if (owner) {
            await recordUsage(owner, "ai_tokens", usage.totalTokens ?? 0, {
              botId: target.id,
              chatId,
            })
          }
        },
      })

      let reply = ""
      for await (const delta of result.textStream) {
        reply += delta
        yield { botId: target.id, botName: target.name, reply } satisfies Output
      }
      yield { botId: target.id, botName: target.name, reply } satisfies Output
    },
  })
}

export type HandoffTool = ReturnType<typeof createHandoffTool>

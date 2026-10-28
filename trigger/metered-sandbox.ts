import type { Sandbox } from "@daytona/sdk"

import { getStartedSandbox } from "@/lib/daytona"
import { chargeSandbox } from "@/lib/usage"
import type { ChatBotRecord } from "./chat-bots"
import { getChatOwner } from "./chat-bots"

/**
 * Sandbox getter for `createSandboxTools` that bills the chat owner for the
 * sandbox's running time on every call, and refuses once their allowance is
 * spent. The sandbox itself is looked up (and woken) once and reused.
 */
export function createMeteredSandbox(
  chatId: string,
  resolveBot: () => Promise<ChatBotRecord | null | undefined>
) {
  let bot: Promise<ChatBotRecord | null | undefined> | undefined
  let owner: Promise<string | null> | undefined
  let sandbox: Promise<Sandbox> | undefined

  return async () => {
    const [resolved, userId] = await Promise.all([
      (bot ??= resolveBot()),
      (owner ??= getChatOwner(chatId)),
    ])

    if (!resolved?.sandboxId) throw new Error("This bot has no sandbox.")
    if (!userId) throw new Error("This chat has no owner.")

    await chargeSandbox(userId, resolved.id, chatId)

    // Don't cache a failure; the next tool call should try again.
    sandbox ??= getStartedSandbox(resolved.sandboxId)
    sandbox.catch(() => (sandbox = undefined))

    return sandbox
  }
}

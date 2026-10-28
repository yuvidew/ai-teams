import * as Sentry from "@sentry/node"

import { UsageLimitError } from "@/lib/usage"

type Context = {
  runId?: string
  taskId?: string
  chatId?: string
  botId?: string
}

/**
 * Sends an error to Sentry and waits for it to leave: a Trigger.dev worker can
 * be frozen right after a hook returns, which would drop a buffered event.
 *
 * Only ids go along. Task payloads and messages hold private chat content.
 */
export async function captureError(error: unknown, context: Context = {}) {
  // A spent plan allowance is an expected outcome, not a bug.
  if (error instanceof UsageLimitError) return

  Sentry.withScope((scope) => {
    scope.setTags({ source: "trigger", ...context })
    Sentry.captureException(error)
  })

  await Sentry.flush(2000)
}

import * as Sentry from "@sentry/node"

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
  Sentry.withScope((scope) => {
    scope.setTags({ source: "trigger", ...context })
    Sentry.captureException(error)
  })

  await Sentry.flush(2000)
}

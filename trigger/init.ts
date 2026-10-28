import { tasks } from "@trigger.dev/sdk"
import * as Sentry from "@sentry/node"

import { captureError } from "./sentry"

// Loaded automatically before any task runs. The worker already has its own
// OpenTelemetry setup, so Sentry runs with its default integrations off: it
// only reports errors, no tracing.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  defaultIntegrations: false,
  environment:
    process.env.NODE_ENV === "production" ? "production" : "development",
})

// A run that dies after exhausting its retries. Errors thrown inside a
// chat.agent turn are caught by its turn loop and never get here; trigger/chat.ts
// reports those from onTurnComplete.
tasks.onFailure(async ({ error, ctx }) => {
  await captureError(error, { runId: ctx.run.id, taskId: ctx.task.id })
})

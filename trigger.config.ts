import { esbuildPlugin } from "@trigger.dev/build/extensions";
import { defineConfig } from "@trigger.dev/sdk";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";

export default defineConfig({
  project: "proj_iohdubmhrdbfcvwpspge",
  runtime: "node-24",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./trigger"],
  build: {
    extensions: [
      // Uploads source maps on deploy so worker stack traces are readable.
      // Skipped without a token, so deploys don't depend on it.
      ...(process.env.SENTRY_AUTH_TOKEN
        ? [
            esbuildPlugin(
              sentryEsbuildPlugin({
                org: "yd00102",
                project: "ai-teams",
                authToken: process.env.SENTRY_AUTH_TOKEN,
              }),
              { placement: "last", target: "deploy" }
            ),
          ]
        : []),
    ],
  },
});

import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Everything in dev, a sample in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Replay: 10% of sessions, every session that hits an error. Text and media
  // are masked by default, which matters for private chats.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,


  integrations: [Sentry.replayIntegration()],
})

// Traces App Router navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

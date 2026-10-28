import { withSentryConfig } from "@sentry/nextjs/config"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {}

export default withSentryConfig(nextConfig, {
  org: "yd00102",
  project: "ai-teams",

  // Build-time secret for uploading source maps. Without it the build still
  // works, but production stack traces stay minified.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a wider set of client files for better stack traces.
  widenClientFileUpload: true,

  silent: !process.env.CI,
})

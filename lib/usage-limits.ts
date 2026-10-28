import type { UsageKind } from "@/db/schema"

// What one Pro subscription ($20/month) may consume per usage period. Sized so
// a user maxing out every limit costs us well under the subscription price:
//  - AI: Ministral 14B is $0.20 per million tokens (input and output alike), so
//    10M tokens is at most $2.
//  - Sandbox: a default Daytona sandbox (1 vCPU, 1 GiB) is $0.0504 + $0.0162 per
//    hour while running (storage under 5 GiB is free), so 40 hours is ~$2.70.
//  - Bots: each bot owns a sandbox, so the count is capped too.
export const PRO_LIMITS = {
  aiTokens: 10_000_000,
  sandboxSeconds: 40 * 60 * 60,
  bots: 5,
} as const

export const KIND_LIMIT: Record<UsageKind, number> = {
  ai_tokens: PRO_LIMITS.aiTokens,
  sandbox_seconds: PRO_LIMITS.sandboxSeconds,
}

/** Daytona stops an idle sandbox after this long; we bill up to that point. */
export const SANDBOX_AUTO_STOP_MINUTES = 5

function addMonths(date: Date, months: number) {
  const result = new Date(date)
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)

  // Jan 31 + 1 month is Feb 28/29, not March 3.
  const daysInMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(date.getUTCDate(), daysInMonth))

  return result
}

/**
 * The monthly usage period containing `now`, counted from the subscription's
 * anchor date. Annual plans reset usage monthly too.
 */
export function currentPeriod(anchor: Date, now = new Date()) {
  let months =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth())
  months = Math.max(months, 0)

  let start = addMonths(anchor, months)
  if (start > now) start = addMonths(anchor, --months)

  return { start, end: addMonths(anchor, months + 1) }
}

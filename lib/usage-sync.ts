import { clerkClient } from "@clerk/nextjs/server"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { usageAccounts } from "@/db/schema"

// Clerk is the source of truth for the plan; the Trigger.dev worker has no
// Clerk session, so we mirror what it needs into usage_accounts.
const FRESH_MS = 5 * 60 * 1000

/**
 * Refreshes the user's usage account from their Clerk subscription (at most
 * every few minutes). Call from server actions and pages, never from tasks.
 */
export async function syncUsageAccount(userId: string, force = false) {
  const existing = await db.query.usageAccounts.findFirst({
    where: eq(usageAccounts.userId, userId),
  })

  if (!force && existing && Date.now() - existing.syncedAt.getTime() < FRESH_MS) {
    return existing
  }

  const client = await clerkClient()
  const subscription = await client.billing
    .getUserBillingSubscription(userId)
    .catch(() => null)
  // A canceled item keeps its benefits until the period ends.
  const item = subscription?.subscriptionItems.find(
    (candidate) =>
      candidate.plan?.slug === "pro" &&
      ["active", "past_due", "canceled"].includes(candidate.status) &&
      (candidate.periodEnd === null || candidate.periodEnd > Date.now())
  )

  const values = {
    entitled: Boolean(item),
    anchor: item ? new Date(item.periodStart) : (existing?.anchor ?? new Date()),
    syncedAt: new Date(),
  }

  const [account] = await db
    .insert(usageAccounts)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: usageAccounts.userId, set: values })
    .returning()

  return account
}

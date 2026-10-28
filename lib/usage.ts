import { and, eq, gte, lt, sql } from "drizzle-orm"

import { db } from "@/db"
import { usageAccounts, usageLedger, type UsageKind } from "@/db/schema"
import {
  KIND_LIMIT,
  SANDBOX_AUTO_STOP_MINUTES,
  currentPeriod,
} from "@/lib/usage-limits"

// Shared by the Next.js app and the Trigger.dev worker, so it only touches the
// database (no Clerk): the plan is mirrored into usage_accounts by usage-sync.

export type UsageSnapshot = {
  entitled: boolean
  period: { start: Date; end: Date }
  used: Record<UsageKind, number>
}

/** Thrown when a metered action is refused. The message is shown to the user. */
export class UsageLimitError extends Error {}

export async function getUsageSnapshot(
  userId: string
): Promise<UsageSnapshot | null> {
  const account = await db.query.usageAccounts.findFirst({
    where: eq(usageAccounts.userId, userId),
  })

  if (!account) return null

  const period = currentPeriod(account.anchor)
  const rows = await db
    .select({
      kind: usageLedger.kind,
      total: sql<number>`coalesce(sum(${usageLedger.amount}), 0)::int`,
    })
    .from(usageLedger)
    .where(
      and(
        eq(usageLedger.userId, userId),
        gte(usageLedger.createdAt, period.start),
        lt(usageLedger.createdAt, period.end)
      )
    )
    .groupBy(usageLedger.kind)

  const used: Record<UsageKind, number> = { ai_tokens: 0, sandbox_seconds: 0 }
  for (const row of rows) used[row.kind] = row.total

  return { entitled: account.entitled, period, used }
}

const LABEL: Record<UsageKind, string> = {
  ai_tokens: "AI usage",
  sandbox_seconds: "sandbox time",
}

/** Throws a UsageLimitError unless the user's plan has room left for `kind`. */
export async function assertWithinLimit(userId: string, kind: UsageKind) {
  const snapshot = await getUsageSnapshot(userId)

  if (!snapshot?.entitled) {
    throw new UsageLimitError("Upgrade to Pro to use bots and sandboxes.")
  }

  if (snapshot.used[kind] >= KIND_LIMIT[kind]) {
    throw new UsageLimitError(
      `You've used all of your ${LABEL[kind]} for this period. It resets on ${snapshot.period.end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}.`
    )
  }
}

export async function recordUsage(
  userId: string,
  kind: UsageKind,
  amount: number,
  meta: { botId?: string; chatId?: string } = {}
) {
  if (!Number.isFinite(amount) || amount <= 0) return

  await db.insert(usageLedger).values({
    userId,
    kind,
    amount: Math.ceil(amount),
    ...meta,
  })
}

/**
 * Bills the bot's sandbox for the time it is about to run. Daytona auto-stops
 * an idle sandbox, so every use extends a paid-until mark by that interval and
 * only the extension is charged: steady use costs real elapsed seconds, and a
 * one-off use costs the idle tail. Refuses when the allowance is spent.
 */
export async function chargeSandbox(
  userId: string,
  botId: string,
  chatId?: string
) {
  await assertWithinLimit(userId, "sandbox_seconds")

  // One statement, so two concurrent calls can't both bill the same seconds.
  const result = await db.execute<{ charged: number }>(sql`
    WITH prev AS (
      SELECT sandbox_paid_until AS until FROM bots WHERE id = ${botId} FOR UPDATE
    )
    UPDATE bots
    SET sandbox_paid_until = now() + make_interval(mins => ${SANDBOX_AUTO_STOP_MINUTES}::int)
    FROM prev
    WHERE bots.id = ${botId}
    RETURNING ceil(extract(epoch FROM (
      bots.sandbox_paid_until - greatest(coalesce(prev.until, now()), now())
    )))::int AS charged
  `)

  const charged = Number(result.rows[0]?.charged ?? 0)
  await recordUsage(userId, "sandbox_seconds", charged, { botId, chatId })
}

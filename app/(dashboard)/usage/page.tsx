import { auth } from "@clerk/nextjs/server"
import { count, eq } from "drizzle-orm"
import Link from "next/link"

import { db } from "@/db"
import { bots } from "@/db/schema"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { getUsageSnapshot } from "@/lib/usage"
import { PRO_LIMITS } from "@/lib/usage-limits"
import { syncUsageAccount } from "@/lib/usage-sync"
import { ResetCountdown } from "./reset-countdown"

const number = new Intl.NumberFormat("en-US")

function formatTokens(tokens: number) {
  return tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 2)}M`
    : number.format(tokens)
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function Meter({
  label,
  description,
  used,
  limit,
  display,
}: {
  label: string
  description: string
  used: number
  limit: number
  display: string
}) {
  const percent = Math.min((used / limit) * 100, 100)

  return (
    <div className="flex flex-col gap-2">
      <Progress value={percent}>
        <ProgressLabel>{label}</ProgressLabel>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {display}
        </span>
      </Progress>
      <p className="text-xs text-muted-foreground">
        {description}
        {used >= limit && " Limit reached."}
      </p>
    </div>
  )
}

export default async function UsagePage() {
  const { userId } = await auth.protect()

  await syncUsageAccount(userId)
  const [snapshot, [{ total: botCount }]] = await Promise.all([
    getUsageSnapshot(userId),
    db.select({ total: count() }).from(bots).where(eq(bots.userId, userId)),
  ])

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p className="text-sm text-muted-foreground">
          What your plan includes each month, and how much of it you&apos;ve
          used.
        </p>
      </div>

      {!snapshot?.entitled ? (
        <Card>
          <CardHeader>
            <CardTitle>You&apos;re on the free plan</CardTitle>
            <CardDescription>
              Bots and sandboxes are part of Pro, so there&apos;s no allowance
              to track yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link href="/pricing" />}>View plans</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Pro plan</CardTitle>
            <CardDescription>
              Resets in <ResetCountdown endsAt={snapshot.period.end.getTime()} />{" "}
              (
              {snapshot.period.end.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
              )
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Meter
              label="AI usage"
              description="Tokens read and written by your bots."
              used={snapshot.used.ai_tokens}
              limit={PRO_LIMITS.aiTokens}
              display={`${formatTokens(snapshot.used.ai_tokens)} / ${formatTokens(PRO_LIMITS.aiTokens)} tokens`}
            />
            <Meter
              label="Sandbox time"
              description="How long your bots' sandboxes were running."
              used={snapshot.used.sandbox_seconds}
              limit={PRO_LIMITS.sandboxSeconds}
              display={`${formatDuration(snapshot.used.sandbox_seconds)} / ${formatDuration(PRO_LIMITS.sandboxSeconds)}`}
            />
            <Meter
              label="Bots"
              description="Each bot comes with its own sandbox. Not reset monthly."
              used={botCount}
              limit={PRO_LIMITS.bots}
              display={`${botCount} / ${PRO_LIMITS.bots}`}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

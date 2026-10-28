"use client"

import { useSyncExternalStore } from "react"

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 1000)
  return () => clearInterval(timer)
}

const getNow = () => Math.floor(Date.now() / 1000)
// Rendered on the server and during hydration, where "now" isn't known yet.
const getServerNow = () => 0

function format(seconds: number) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const parts = [
    days > 0 && `${days}d`,
    (days > 0 || hours > 0) && `${hours}h`,
    `${minutes}m`,
    days === 0 && `${secs}s`,
  ]

  return parts.filter(Boolean).join(" ")
}

/** Live "time until reset" for a usage period ending at `endsAt` (ms). */
export function ResetCountdown({ endsAt }: { endsAt: number }) {
  const now = useSyncExternalStore(subscribe, getNow, getServerNow)

  if (now === 0) return <span>&nbsp;</span>

  const remaining = Math.max(Math.floor(endsAt / 1000) - now, 0)

  return <span className="tabular-nums">{format(remaining)}</span>
}

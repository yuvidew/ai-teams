"use client"

import { useEffect, useState } from "react"

import { ChatAvatar } from "@/components/chat-avatar"
import { cn } from "@/lib/utils"

const TOOLS = [
  { name: "Claude Code", logo: "/tools/claude.svg" },
  { name: "Codex", logo: "/tools/openai.svg" },
  { name: "Cursor", logo: "/tools/cursor.svg" },
] as const

const SWITCH_MS = 2600

// The brand marks are single-colour SVGs; using them as a mask lets them
// follow the theme's text colour in light and dark mode.
function Logo({ src, className }: { src: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block bg-foreground", className)}
      style={{
        mask: `url(${src}) center / contain no-repeat`,
        WebkitMask: `url(${src}) center / contain no-repeat`,
      }}
    />
  )
}

// AI Teams on the left, the AI tools it plugs into on the right, fading from
// one tool to the next.
function ConnectShowcase() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % TOOLS.length),
      SWITCH_MS
    )

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-20 items-center justify-center rounded-2xl border bg-card shadow-sm sm:size-24">
            <ChatAvatar
              seed="ai-teams"
              animated
              className="size-14 sm:size-16"
            />
          </div>
          <span className="text-sm font-medium">AI Teams</span>
        </div>

        <div
          aria-hidden
          className="relative h-0.5 w-12 overflow-hidden rounded-full bg-border sm:w-20"
        >
          <span className="absolute inset-y-0 left-0 w-1/2 animate-[connect-flow_1.4s_linear_infinite] rounded-full bg-foreground/60" />
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="relative size-20 rounded-2xl border bg-card shadow-sm sm:size-24">
            {TOOLS.map((tool, i) => (
              <div
                key={tool.name}
                className={cn(
                  "absolute inset-0 flex items-center justify-center transition-all duration-700 ease-out",
                  i === index ? "scale-100 opacity-100" : "scale-90 opacity-0"
                )}
              >
                <Logo src={tool.logo} className="size-10 sm:size-12" />
              </div>
            ))}
          </div>
          <span className="relative h-5 w-28 text-center text-sm font-medium">
            {TOOLS.map((tool, i) => (
              <span
                key={tool.name}
                aria-hidden={i !== index}
                className={cn(
                  "absolute inset-0 transition-opacity duration-700",
                  i === index ? "opacity-100" : "opacity-0"
                )}
              >
                {tool.name}
              </span>
            ))}
          </span>
        </div>
      </div>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        AI Teams plugs into Claude Code, Codex and Cursor over MCP. Your AI tool
        becomes the bots&apos; brain; AI Teams gives them a sandbox, a desktop
        and teammates.
      </p>
    </div>
  )
}

export { ConnectShowcase }

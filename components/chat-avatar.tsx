import { Avatar, Style } from "@dicebear/core"
import gaze from "@dicebear/styles/gaze.json" with { type: "json" }
import Image from "next/image"
import { cn } from "cn"

const style = new Style(gaze)

const ANIMATED = ["slow", "medium", "fast"] as const
const STATIC = ["none"] as const

type ChatAvatarProps = {
  /** Same seed always produces the same face. */
  seed: string
  /** Let the eyes wander and blink while the body hops. */
  animated?: boolean
  className?: string
}

function ChatAvatar({ seed, animated = false, className }: ChatAvatarProps) {
  const src = new Avatar(style, {
    seed,
    animationVariant: animated ? ANIMATED : STATIC,
    animationProbability: 100,
  }).toDataUri()

  return (
    <Image
      src={src}
      alt=""
      width={45}
      height={45}
      unoptimized
      className={cn("size-12 shrink-0", className)}
    />
  )
}

export { ChatAvatar }
export type { ChatAvatarProps }

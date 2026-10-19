import { cn } from "cn"

import { ChatAvatar } from "@/components/chat-avatar"

const MAX_VISIBLE = 3

type GroupChatAvatarProps = {
  /** One avatar seed per member, in join order. */
  seeds: string[]
  className?: string
}

// Absolute boxes for the 2 and 3 avatar layouts, as a percentage of the
// square. Both overlap slightly so the members read as one cluster.
const SIDE_BY_SIDE = [
  "top-[18%] left-0 size-[64%]",
  "top-[18%] right-0 size-[64%]",
]
const TRIANGLE = [
  "top-0 left-[22%] size-[56%]",
  "bottom-0 left-0 size-[56%]",
  "bottom-0 right-0 size-[56%]",
]

/**
 * Stands in for a ChatAvatar in a group chat and takes up exactly the same
 * square (`size-12` unless overridden), so rows and headers don't shift.
 * Shows up to three members and folds the rest into a "+N" tile: two sit side
 * by side, three form a triangle, and four fill a 2x2 grid.
 */
function GroupChatAvatar({ seeds, className }: GroupChatAvatarProps) {
  const visible = seeds.slice(0, MAX_VISIBLE)
  const hidden = seeds.length - visible.length

  return (
    <div className={cn("@container relative size-12 shrink-0", className)}>
      {hidden > 0 ? (
        <div className="grid size-full grid-cols-2 grid-rows-2">
          {visible.map((seed) => (
            <ChatAvatar key={seed} seed={seed} className="size-full" />
          ))}
          <div className="m-[8%] flex items-center justify-center rounded-full bg-muted text-[22cqw] leading-none font-medium text-muted-foreground">
            +{hidden}
          </div>
        </div>
      ) : (
        visible.map((seed, index) => (
          <ChatAvatar
            key={seed}
            seed={seed}
            className={cn(
              "absolute",
              (visible.length === 2 ? SIDE_BY_SIDE : TRIANGLE)[index]
            )}
          />
        ))
      )}
    </div>
  )
}

export { GroupChatAvatar }

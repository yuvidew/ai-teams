import { UserButton } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"
import { PlusIcon } from "lucide-react"
import { nanoid } from "nanoid"

import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"

export default async function Page() {
  await auth.protect()

  return (
    <div className="relative flex min-h-svh flex-col">
      <div className="absolute top-4 right-4">
        <UserButton />
      </div>
      <Empty>
        <EmptyHeader>
          <ChatAvatar seed={nanoid()} className="mb-2" />
          <EmptyTitle>Meet your first bot</EmptyTitle>
          <EmptyDescription>
            Every bot gets its own personality, memory, and face. Spin one up
            and start the conversation.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="secondary">
            <PlusIcon data-icon="inline-start" />
            Create a new bot
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}

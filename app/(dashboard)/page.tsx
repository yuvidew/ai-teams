import { UserButton } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"

import { ConnectShowcase } from "@/components/connect-showcase"
import { ConnectTabs, EXAMPLE_PROMPT } from "@/components/connect-tabs"
import { CopyBlock } from "@/components/copy-block"
import { getMcpUrl } from "@/lib/mcp-url"

export default async function Page() {
  await auth.protect()

  const mcpUrl = await getMcpUrl()

  return (
    <div className="relative flex min-h-svh flex-col">
      <div className="absolute top-4 right-4">
        <UserButton />
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8 px-4 py-16">
        <ConnectShowcase />

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-base font-medium">Connect your AI tool</h1>
            <p className="text-sm text-muted-foreground">
              Pick your tool and add AI Teams to it as an MCP server.
            </p>
          </div>
          <ConnectTabs mcpUrl={mcpUrl} />
          <CopyBlock
            label="3. Then try it: ask your AI tool to create a bot and give it a task"
            value={EXAMPLE_PROMPT}
          />
        </section>
      </div>
    </div>
  )
}

import { asc, eq } from "drizzle-orm"
import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { z } from "zod"

import { db } from "@/db"
import { bots, insertBotSchema } from "@/db/schema"
import { buildBotSystemPrompt } from "@/lib/bot-prompt"
import { createBotForUser } from "@/lib/create-bot"
import { getMcpUserId, verifyMcpToken } from "@/lib/mcp-auth"
import { getBotSandboxTools, getOwnedBot } from "@/lib/mcp-sandbox"
import { createSandboxTools } from "@/lib/sandbox-tools"

// An MCP server for Claude Code, Cursor and Codex. The client's own model is
// the bot's brain, so this app makes no AI call and needs no AI key: it hands
// out the bot's persona, creates bots and runs their sandbox tools.

const botId = z.string().min(1).describe("Id of the bot, from list_bots")

const text = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    },
  ],
})

const failure = (error: unknown) => ({
  isError: true,
  ...text(error instanceof Error ? error.message : "Something went wrong."),
})

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_bots",
      {
        title: "List bots",
        description:
          "List your AI teammates (bots). Call get_bot with an id to become one of them.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const rows = await db
            .select({ id: bots.id, name: bots.name, job: bots.job })
            .from(bots)
            .where(eq(bots.userId, userId))
            .orderBy(asc(bots.createdAt))

          return text(rows)
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "get_bot",
      {
        title: "Get bot",
        description:
          "Get a bot's full instructions. Adopt them as your own for the rest of the conversation: you are that bot, and every sandbox tool must be called with its botId.",
        inputSchema: z.object({ botId }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const bot = await getOwnedBot(userId, args.botId)

          if (!bot) return failure(new Error("Bot not found."))

          return text(
            `${buildBotSystemPrompt(bot)}\n\n## Using the tools here\nYour botId is ${bot.id}. Pass it as botId to bash, readFile, writeFile, listFiles, mouseClick, mouseMove, mouseScroll, keyboardType, keyboardPress, viewScreen and showScreen. Both screenshot tools return the picture to you.`
          )
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "create_bot",
      {
        title: "Create bot",
        description:
          "Create a new bot (an AI teammate) with its own private sandbox: a Linux desktop it can run commands on and browse with. Returns its id. Then call get_bot to become it, and use the sandbox tools with its botId to do the work. Needs the Pro plan; there is a cap on how many bots one account can have.",
        inputSchema: insertBotSchema.omit({ avatar: true }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const result = await createBotForUser(userId, args)

          if (!result.success) return failure(new Error(result.error))

          return text({
            id: result.id,
            name: args.name,
            next: `Call get_bot with botId ${result.id} to take on its role, then use the sandbox tools with that botId.`,
          })
        } catch (error) {
          return failure(error)
        }
      }
    )

    // The sandbox tools. Each takes the bot id in addition to its own input.
    const names = [
      "bash",
      "readFile",
      "writeFile",
      "listFiles",
      "mouseClick",
      "mouseMove",
      "mouseScroll",
      "keyboardType",
      "keyboardPress",
      "viewScreen",
      "showScreen",
    ] as const

    // Only the shapes are needed here; any bot's tools have the same ones.
    const shapes = getShapes()

    for (const name of names) {
      const { description, inputSchema } = shapes[name]

      server.registerTool(
        name,
        {
          title: name,
          description,
          inputSchema: inputSchema.extend({ botId }),
        },
        async (args, ctx) => {
          try {
            const { botId: id, ...input } = args as { botId: string }
            const userId = getMcpUserId(ctx.http?.authInfo)
            const tools = await getBotSandboxTools(userId, id)
            const tool = tools[name]
            const output: unknown = await tool.execute!(
              input as never,
              { toolCallId: `mcp-${name}`, messages: [] } as never
            )

            if (
              output &&
              typeof output === "object" &&
              "image" in output &&
              "mediaType" in output
            ) {
              const { image, mediaType, width, height } = output as {
                image: string
                mediaType: string
                width: number | null
                height: number | null
              }

              return {
                content: [
                  {
                    type: "text" as const,
                    text: `Screenshot${width && height ? `, ${width}x${height} pixels` : ""}. Mouse and click coordinates use this pixel space.`,
                  },
                  { type: "image" as const, data: image, mimeType: mediaType },
                ],
              }
            }

            return text(output)
          } catch (error) {
            return failure(error)
          }
        }
      )
    }
  },
  { serverInfo: { name: "ai-teams", version: "0.1.0" } }
)

const authHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
})

export { authHandler as GET, authHandler as POST, authHandler as DELETE }

// createSandboxTools only reads its argument when a tool runs, so it can be
// built without a sandbox just to read each tool's description and schema.
function getShapes() {
  const tools = createSandboxTools(async () => {
    throw new Error("No sandbox.")
  })

  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      {
        description: tool.description ?? name,
        inputSchema: tool.inputSchema as z.ZodObject,
      },
    ])
  ) as Record<
    keyof typeof tools,
    { description: string; inputSchema: z.ZodObject }
  >
}

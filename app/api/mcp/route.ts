import { asc, eq } from "drizzle-orm"
import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { z } from "zod"

import { db } from "@/db"
import { bots, insertBotSchema } from "@/db/schema"
import { buildBotSystemPrompt } from "@/lib/bot-prompt"
import { createBotForUser } from "@/lib/create-bot"
import {
  addBotToGroup,
  createGroupForUser,
  getOwnedGroup,
  listGroups,
  postDirectMessage,
  postGroupMessage,
  readGroupMessages,
} from "@/lib/groups"
import { getMcpUserId, verifyMcpToken } from "@/lib/mcp-auth"
import { getBotSandboxTools, getOwnedBot } from "@/lib/mcp-sandbox"
import { createSandboxTools } from "@/lib/sandbox-tools"

// An MCP server for Claude Code, Cursor and Codex. The client's own model is
// the bot's brain, so this app makes no AI call and needs no AI key: it hands
// out the bot's persona, creates bots and runs their sandbox tools.

const botId = z.string().min(1).describe("Id of the bot, from list_bots")
const groupId = z.string().min(1).describe("Id of the group, from list_groups")

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
            `${buildBotSystemPrompt(bot)}\n\n## Using the tools here\nYour botId is ${bot.id}. Pass it as botId to bash, readFile, writeFile, listFiles, mouseClick, mouseMove, mouseScroll, keyboardType, keyboardPress, viewScreen and showScreen. Both screenshot tools return the picture to you. If you are working in a group, use get_group to see your teammates and post_group_message to talk to them. After each task, call log_chat_message to record what the user asked and your reply, so they can read it in the web app.`
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
          "Create a new bot (an AI teammate) with its own private sandbox: a Linux desktop it can run commands on and browse with. Returns its id. Then call get_bot to become it, and use the sandbox tools with its botId to do the work.",
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

    server.registerTool(
      "log_chat_message",
      {
        title: "Log chat message",
        description:
          "Record a message in a bot's one-on-one chat so the user can read the conversation in the web app. Log what the user asked (from: user) and the bot's reply (from: bot).",
        inputSchema: z.object({
          botId,
          from: z.enum(["user", "bot"]),
          content: z.string().min(1).max(4000),
        }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const result = await postDirectMessage(userId, args)

          return result.success
            ? text({ id: result.id })
            : failure(new Error(result.error))
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "create_group",
      {
        title: "Create group",
        description:
          "Create a group of two or more of your bots so they can work together on a task. Returns the group id. Then call get_group and take turns being each bot, talking through post_group_message.",
        inputSchema: z.object({
          name: z.string().min(1).max(50).describe("Name of the group"),
          botIds: z
            .array(z.string().min(1))
            .min(2)
            .describe("Ids of the bots to put in the group, from list_bots"),
        }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const result = await createGroupForUser(userId, args)

          if (!result.success) return failure(new Error(result.error))

          return text({
            id: result.id,
            next: `Call get_group with groupId ${result.id} to see the team and start the task.`,
          })
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "add_bot_to_group",
      {
        title: "Add bot to group",
        description: "Add one of your bots to an existing group.",
        inputSchema: z.object({ groupId, botId }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const result = await addBotToGroup(userId, args.groupId, args.botId)

          return result.success
            ? text("Added.")
            : failure(new Error(result.error))
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "list_groups",
      {
        title: "List groups",
        description: "List your groups of bots and who is in each.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        try {
          return text(await listGroups(getMcpUserId(ctx.http?.authInfo)))
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "get_group",
      {
        title: "Get group",
        description:
          "Get a group's members and the recent conversation, with instructions on how the bots collaborate. Use it to start or resume group work.",
        inputSchema: z.object({ groupId }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const group = await getOwnedGroup(userId, args.groupId)

          if (!group) return failure(new Error("Group not found."))

          const history = await readGroupMessages(userId, group.id, {
            limit: 30,
          })
          const roster = group.bots
            .map((bot) => `- ${bot.name} (botId ${bot.id}): ${bot.job}`)
            .join("\n")

          return text(
            `# Group: ${group.name}\n\n## Members\n${roster}\n\n## How to work together\nYou play every bot in this group, one turn at a time. The bots share one conversation (post_group_message / read_group_messages) but each has its own private sandbox, so a bot cannot use another's files: pass results by writing them in a message.\n1. Break the task into parts that fit each bot's job.\n2. For each part, call get_bot for that bot, do its work with its sandbox tools (using its botId), then call post_group_message as that bot with what it did, mentioning the bot that should go next.\n3. Before a bot starts, call read_group_messages so it builds on what the others posted.\n4. When the task is complete, post a final message summarizing the outcome, then tell the user.\n\n## Recent messages\n${JSON.stringify(history.success ? history.messages : [], null, 2)}`
          )
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "post_group_message",
      {
        title: "Post group message",
        description:
          "Post a message to a group as one of its bots. Use it to share progress, results or a request for another bot. Mention bots by exact name to hand work to them.",
        inputSchema: z.object({
          groupId,
          botId: botId.describe("The bot sending the message"),
          content: z.string().min(1).max(4000),
          mentions: z
            .array(z.string())
            .optional()
            .describe("Exact names of the bots this is for; omit for everyone"),
        }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const result = await postGroupMessage(userId, args)

          return result.success
            ? text({ id: result.id })
            : failure(new Error(result.error))
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "read_group_messages",
      {
        title: "Read group messages",
        description:
          "Read a group's conversation, oldest first. Pass after (a message id) to get only newer messages.",
        inputSchema: z.object({
          groupId,
          after: z.string().optional().describe("Only messages after this id"),
          limit: z.number().int().min(1).max(200).optional(),
        }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const result = await readGroupMessages(userId, args.groupId, args)

          return result.success
            ? text(result.messages)
            : failure(new Error(result.error))
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

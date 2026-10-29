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
import {
  callAppTool,
  createConnectLink,
  listAppTools,
  findConnectUrl,
  listConnectedApps,
  waitForAppConnection,
} from "@/lib/mcp-pipedream"
import { getChatUrl } from "@/lib/mcp-url"
import { getBotSandboxTools, getOwnedBot } from "@/lib/mcp-sandbox"
import { createSandboxTools } from "@/lib/sandbox-tools"

// wait_for_app_connection can hold a request open for about a minute.
export const maxDuration = 60

// An MCP server for Claude Code, Cursor and Codex. The client's own model is
// the bot's brain, so this app makes no AI call and needs no AI key: it hands
// out the bot's persona, creates bots and runs their sandbox tools.

const botId = z.string().min(1).describe("Id of the bot, from list_bots")
const appSlug = z
  .string()
  .regex(/^[a-z0-9_]{1,64}$/)
  .describe("App slug, lowercase: gmail, slack, notion, github, ...")
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

const connectInstructions = (app: string, url: string, expiresAt?: string) =>
  `${app} is not connected yet, so the task cannot go on.

1. Tell the user, in your reply, to open this link and sign in to ${app}. Show the link exactly as written, as a clickable link:
${url}

2. Then call wait_for_app_connection with app "${app}". When it says connected, continue the task by calling run_app_tool again with the same inputs. Do not give up or ask the user to repeat the request.${expiresAt ? `\n\nThe link expires at ${expiresAt}.` : ""}`

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
            `${buildBotSystemPrompt(bot)}\n\n## Using the tools here\nYour botId is ${bot.id}. Pass it as botId to bash, readFile, writeFile, listFiles, mouseClick, mouseMove, mouseScroll, keyboardType, keyboardPress, viewScreen and showScreen. Both screenshot tools return the picture to you. If you are working in a group, use get_group to see your teammates and post_group_message to talk to them. If the task needs one of the user's other apps (Gmail, Slack, Notion, ...), call list_connected_apps, and if it is missing call connect_app, show the user the link and call wait_for_app_connection, then use list_app_tools, get_app_tool and run_app_tool. When the task is done, call log_chat_message to record the task the user wants done (only the task, not the "use the bot ..." part of their message) and your reply, then end your final message to the user with the chat link it returns, so they can open the conversation in the web app.`
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
            chatUrl: await getChatUrl(result.chatId),
            next: `Call get_bot with botId ${result.id} to take on its role, then use the sandbox tools with that botId. When done, log the conversation with log_chat_message and give the user the chat link.`,
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
          "Record a message in a bot's one-on-one chat so the user can read the conversation in the web app. Log only the task itself as the user's request (from: user), phrased as if the user had said it to the bot directly (for example 'Send a hello message'), never the routing words like 'use the ai-teams bot X'. Then log the bot's reply (from: bot). Returns chatUrl: when the task is complete, give the user that link so they can open the conversation.",
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
            ? text({
                id: result.id,
                chatUrl: await getChatUrl(result.chatId),
              })
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
            chatUrl: await getChatUrl(result.id),
            next: `Call get_group with groupId ${result.id} to see the team and start the task. When the task is done, post a final summary with post_group_message and give the user the chat link.`,
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
            `# Group: ${group.name}\n\n## Members\n${roster}\n\n## How to work together\nYou play every bot in this group, one turn at a time. The bots share one conversation (post_group_message / read_group_messages) but each has its own private sandbox, so a bot cannot use another's files: pass results by writing them in a message.\n1. Break the task into parts that fit each bot's job.\n2. For each part, call get_bot for that bot, do its work with its sandbox tools (using its botId), then call post_group_message as that bot with what it did, mentioning the bot that should go next.\n3. Before a bot starts, call read_group_messages so it builds on what the others posted.\n4. When the task is complete, post a final message summarizing the outcome, then tell the user and give them the chat link: ${await getChatUrl(group.id)}\n\n## Recent messages\n${JSON.stringify(history.success ? history.messages : [], null, 2)}`
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
          "Post a message to a group as one of its bots. Use it to share progress, results or a request for another bot. Mention bots by exact name to hand work to them. Returns chatUrl: when the whole task is complete, give the user that link.",
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
            ? text({
                id: result.id,
                chatUrl: await getChatUrl(args.groupId),
              })
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

    // Other apps (Gmail, Slack, Notion, ...) through Pipedream. The user signs
    // in to each app once with a link; their bots can then act in it.
    server.registerTool(
      "connect_app",
      {
        title: "Connect app",
        description:
          "Get a link for the user to sign in to one of their apps (gmail, slack, notion, googlesheets, github, ...) so a bot can work in it. Show the user the link and ask them to open it, then call wait_for_app_connection and continue the task. Omit app to let them pick from a list.",
        inputSchema: z.object({
          app: appSlug.optional(),
        }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const link = await createConnectLink(userId, args.app)

          return text(
            connectInstructions(args.app ?? "the app", link.url, link.expiresAt)
          )
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "wait_for_app_connection",
      {
        title: "Wait for app connection",
        description:
          "After you gave the user a connect link, call this to wait (up to about a minute) until they have signed in to the app. When it says connected, carry on with the task by calling run_app_tool again. If it times out, ask the user whether they finished signing in, then call it again.",
        inputSchema: z.object({
          app: appSlug,
          timeoutSeconds: z.number().int().min(5).max(55).optional(),
        }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const connected = await waitForAppConnection(
            userId,
            args.app,
            (args.timeoutSeconds ?? 45) * 1000
          )

          return text(
            connected
              ? `${args.app} is connected. Continue the task now: call run_app_tool again with the same inputs.`
              : `${args.app} is not connected yet. Ask the user to open the link and finish signing in, then call wait_for_app_connection again.`
          )
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "list_connected_apps",
      {
        title: "List connected apps",
        description:
          "List the apps the user has signed in to, so you know which ones a bot can use. If the app you need is missing, call connect_app.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        try {
          return text(await listConnectedApps(getMcpUserId(ctx.http?.authInfo)))
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "list_app_tools",
      {
        title: "List app tools",
        description:
          "List the actions an app offers (for example slack-send-message). Filter with query. Then call get_app_tool for a tool's inputs and run_app_tool to run it.",
        inputSchema: z.object({
          app: appSlug,
          query: z
            .string()
            .optional()
            .describe("Only tools whose name or description contains this"),
        }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const query = args.query?.toLowerCase()
          const tools = (await listAppTools(userId, args.app)).filter(
            (tool) =>
              !query ||
              tool.name.toLowerCase().includes(query) ||
              tool.description?.toLowerCase().includes(query)
          )

          return text({
            total: tools.length,
            tools: tools.slice(0, 40).map((tool) => ({
              name: tool.name,
              description: tool.description?.split(" [See")[0],
            })),
            ...(tools.length > 40 && {
              note: "Showing 40. Narrow it with query.",
            }),
          })
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "get_app_tool",
      {
        title: "Get app tool",
        description:
          "Get the inputs one app action takes (its JSON schema), before running it with run_app_tool.",
        inputSchema: z.object({ app: appSlug, tool: z.string().min(1) }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)
          const found = (await listAppTools(userId, args.app)).find(
            (tool) => tool.name === args.tool
          )

          return found
            ? text(found)
            : failure(new Error(`No tool ${args.tool} in ${args.app}.`))
        } catch (error) {
          return failure(error)
        }
      }
    )

    server.registerTool(
      "run_app_tool",
      {
        title: "Run app tool",
        description:
          "Run an action in one of the user's apps as them, such as sending an email or posting to Slack. Check what it takes with get_app_tool first. This changes real data, so only run what the user asked for. If it says the app is not connected, show the user the link it gives, call wait_for_app_connection, then run this again.",
        inputSchema: z.object({
          app: appSlug,
          tool: z.string().min(1),
          input: z
            .record(z.string(), z.unknown())
            .default({})
            .describe("The tool's inputs, matching its schema"),
        }),
      },
      async (args, ctx) => {
        try {
          const userId = getMcpUserId(ctx.http?.authInfo)

          // Check the account first: Pipedream validates the inputs before it
          // checks the account, so a wrong input would hide the connect link.
          const apps = await listConnectedApps(userId)

          if (!apps.some((item) => item.app === args.app && item.healthy)) {
            const link = await createConnectLink(userId, args.app)

            return text(connectInstructions(args.app, link.url, link.expiresAt))
          }

          const result = await callAppTool(
            userId,
            args.app,
            args.tool,
            args.input
          )

          // The user has not signed in to this app yet: say so plainly instead
          // of passing the raw reply through, which the model tends to skip.
          const connectUrl = findConnectUrl(result)

          if (connectUrl) {
            return text(connectInstructions(args.app, connectUrl))
          }

          return {
            content: (result.content ?? []) as {
              type: "text"
              text: string
            }[],
            ...(result.isError && { isError: true }),
          }
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

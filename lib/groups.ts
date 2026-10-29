import { and, asc, desc, eq, gt, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"

import { db } from "@/db"
import { bots, chatMembers, chatMessages, chats } from "@/db/schema"

type Result<T> = ({ success: true } & T) | { success: false; error: string }

const MAX_CONTENT = 4000

/** The group, if it is the user's. Includes its bots, oldest member first. */
export async function getOwnedGroup(userId: string, groupId: string) {
  const chat = await db.query.chats.findFirst({
    where: and(
      eq(chats.id, groupId),
      eq(chats.userId, userId),
      eq(chats.kind, "group")
    ),
    with: {
      members: {
        orderBy: (members) => asc(members.joinedAt),
        with: { bot: { columns: { id: true, name: true, job: true } } },
      },
    },
  })

  if (!chat) return null

  return {
    id: chat.id,
    name: chat.name ?? "Group chat",
    bots: chat.members.map((member) => member.bot),
  }
}

export async function listGroups(userId: string) {
  const rows = await db.query.chats.findMany({
    where: and(eq(chats.userId, userId), eq(chats.kind, "group")),
    orderBy: desc(chats.lastMessageAt),
    with: {
      members: { with: { bot: { columns: { id: true, name: true } } } },
    },
  })

  return rows.map((chat) => ({
    id: chat.id,
    name: chat.name ?? "Group chat",
    bots: chat.members.map((member) => member.bot),
  }))
}

/** Creates a group chat out of two or more of the user's bots. */
export async function createGroupForUser(
  userId: string,
  input: { name: string; botIds: string[] }
): Promise<Result<{ id: string }>> {
  const name = input.name.trim()
  const botIds = [...new Set(input.botIds)]

  if (!name) return { success: false, error: "Name is required." }
  if (name.length > 50) return { success: false, error: "Name is too long." }
  if (botIds.length < 2) {
    return { success: false, error: "A group needs at least two bots." }
  }

  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.userId, userId), inArray(bots.id, botIds)))

  if (owned.length !== botIds.length) {
    return { success: false, error: "One or more bots were not found." }
  }

  const id = nanoid()

  await db.batch([
    db.insert(chats).values({ id, userId, kind: "group", name }),
    db
      .insert(chatMembers)
      .values(botIds.map((botId) => ({ chatId: id, botId }))),
  ])

  return { success: true, id }
}

/** Adds one of the user's bots to an existing group. */
export async function addBotToGroup(
  userId: string,
  groupId: string,
  botId: string
): Promise<Result<object>> {
  const group = await getOwnedGroup(userId, groupId)

  if (!group) return { success: false, error: "Group not found." }
  if (group.bots.some((bot) => bot.id === botId)) {
    return { success: false, error: "That bot is already in the group." }
  }

  const [bot] = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))

  if (!bot) return { success: false, error: "Bot not found." }

  await db.insert(chatMembers).values({ chatId: groupId, botId })

  return { success: true }
}

/**
 * Appends a message to the group's transcript. `botId` is the sender, which
 * must be a member; omit it for a message from the user.
 */
export async function postGroupMessage(
  userId: string,
  input: {
    groupId: string
    botId?: string
    content: string
    mentions?: string[]
  }
): Promise<Result<{ id: string }>> {
  const group = await getOwnedGroup(userId, input.groupId)

  if (!group) return { success: false, error: "Group not found." }

  const content = input.content.trim()

  if (!content) return { success: false, error: "Message is empty." }
  if (content.length > MAX_CONTENT) {
    return {
      success: false,
      error: `Message is too long (max ${MAX_CONTENT} characters).`,
    }
  }

  if (input.botId && !group.bots.some((bot) => bot.id === input.botId)) {
    return { success: false, error: "That bot is not in this group." }
  }

  // Mentions are matched to member names, so a typo is caught here.
  const mentions = [...new Set(input.mentions ?? [])]
  const unknown = mentions.filter(
    (name) => !group.bots.some((bot) => bot.name === name)
  )

  if (unknown.length) {
    return {
      success: false,
      error: `Not in this group: ${unknown.join(", ")}. Members: ${group.bots.map((bot) => bot.name).join(", ")}.`,
    }
  }

  const id = nanoid()
  const sender = group.bots.find((bot) => bot.id === input.botId)?.name

  await db.batch([
    db.insert(chatMessages).values({
      id,
      chatId: group.id,
      botId: input.botId ?? null,
      mentions,
      content,
    }),
    db
      .update(chats)
      .set({
        lastMessagePreview: `${sender ?? "You"}: ${content}`.slice(0, 120),
        lastMessageAt: new Date(),
      })
      .where(eq(chats.id, group.id)),
  ])

  return { success: true, id }
}

/**
 * Logs a message in a bot's one-on-one chat. `from` says who wrote it: the
 * user (the AI tool relaying what they asked) or the bot (its reply).
 */
export async function postDirectMessage(
  userId: string,
  input: { botId: string; from: "user" | "bot"; content: string }
): Promise<Result<{ id: string }>> {
  const content = input.content.trim()

  if (!content) return { success: false, error: "Message is empty." }
  if (content.length > MAX_CONTENT) {
    return {
      success: false,
      error: `Message is too long (max ${MAX_CONTENT} characters).`,
    }
  }

  const [membership] = await db
    .select({ chatId: chats.id })
    .from(chatMembers)
    .innerJoin(chats, eq(chats.id, chatMembers.chatId))
    .where(
      and(
        eq(chatMembers.botId, input.botId),
        eq(chats.userId, userId),
        eq(chats.kind, "direct")
      )
    )

  if (!membership) return { success: false, error: "Bot not found." }

  const id = nanoid()

  await db.batch([
    db.insert(chatMessages).values({
      id,
      chatId: membership.chatId,
      botId: input.from === "bot" ? input.botId : null,
      content,
    }),
    db
      .update(chats)
      .set({
        lastMessagePreview: content.slice(0, 120),
        lastMessageAt: new Date(),
      })
      .where(eq(chats.id, membership.chatId)),
  ])

  return { success: true, id }
}

export type GroupMessage = {
  id: string
  from: string
  mentions: string[]
  content: string
  at: string
}

/** The group's transcript, oldest first. `after` is a message id to read past. */
export async function readGroupMessages(
  userId: string,
  groupId: string,
  options: { after?: string; limit?: number } = {}
): Promise<Result<{ messages: GroupMessage[] }>> {
  const group = await getOwnedGroup(userId, groupId)

  if (!group) return { success: false, error: "Group not found." }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  let since: Date | undefined

  if (options.after) {
    const [marker] = await db
      .select({ createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.id, options.after),
          eq(chatMessages.chatId, group.id)
        )
      )

    since = marker?.createdAt
  }

  // Newest `limit` messages, flipped back to oldest first.
  const rows = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.chatId, group.id),
        since ? gt(chatMessages.createdAt, since) : undefined
      )
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit)

  return {
    success: true,
    messages: rows.reverse().map((row) => ({
      id: row.id,
      from: group.bots.find((bot) => bot.id === row.botId)?.name ?? "User",
      mentions: row.mentions,
      content: row.content,
      at: row.createdAt.toISOString(),
    })),
  }
}

import { relations } from "drizzle-orm"
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"
import { nanoid } from "nanoid"
import type { z } from "zod"

export const bots = pgTable(
  "bots",
  {
    id: text("id").primaryKey().$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(), // Clerk user id
    name: text("name").notNull(),
    avatar: text("avatar").notNull().$defaultFn(() => nanoid()), // seed for the bot's face
    job: text("job").notNull(), // what the bot is for, in a phrase
    instructions: text("instructions"), // how it should go about the job
    sandboxId: text("sandbox_id"), // third-party sandbox id, created lazily
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("bots_user_id_idx").on(t.userId)]
)

// Fields the client may set. `id`, `userId`, `sandboxId` and `createdAt` are
// filled in by the server / database.
export const insertBotSchema = createInsertSchema(bots, {
  name: (schema) => schema.trim().min(1, "Name is required").max(50),
  job: (schema) => schema.trim().min(1, "Job is required").max(100),
  instructions: (schema) => schema.trim().max(2000),
}).pick({ name: true, job: true, instructions: true, avatar: true })

export type InsertBot = z.infer<typeof insertBotSchema>
export type Bot = typeof bots.$inferSelect
export type NewBot = typeof bots.$inferInsert

export const chatKind = pgEnum("chat_kind", ["direct", "group"])

export const chats = pgTable(
  "chats",
  {
    id: text("id").primaryKey().$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(), // Clerk user id
    kind: chatKind("kind").notNull().default("direct"),
    name: text("name"), // null for direct chats, which use the bot's name
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("chats_user_id_idx").on(t.userId)]
)

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.chatId, t.botId] }),
    index("chat_members_bot_id_idx").on(t.botId),
  ]
)

export const botsRelations = relations(bots, ({ many }) => ({
  memberships: many(chatMembers),
}))

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
}))

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, { fields: [chatMembers.chatId], references: [chats.id] }),
  bot: one(bots, { fields: [chatMembers.botId], references: [bots.id] }),
}))

export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert
export type ChatMember = typeof chatMembers.$inferSelect

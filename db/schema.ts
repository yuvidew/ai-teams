import { relations } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"
import { nanoid } from "nanoid"
import { z } from "zod"

export const bots = pgTable(
  "bots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(), // Clerk user id
    name: text("name").notNull(),
    avatar: text("avatar")
      .notNull()
      .$defaultFn(() => nanoid()), // seed for the bot's face
    job: text("job").notNull(), // what the bot is for, in a phrase
    instructions: text("instructions"), // how it should go about the job
    sandboxId: text("sandbox_id"), // third-party sandbox id, created lazily
    // Sandbox running time is billed up to here (see lib/usage.ts). Daytona
    // auto-stops an idle sandbox, so this is when it stops costing us.
    sandboxPaidUntil: timestamp("sandbox_paid_until"),
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
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(), // Clerk user id
    kind: chatKind("kind").notNull().default("direct"),
    name: text("name"), // null for direct chats, which use the bot's name
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("chats_user_id_idx").on(t.userId)]
)

// What the client may set when creating a group chat: a name and its members.
// Everything else (`id`, `userId`, `kind`, timestamps) is filled in server-side.
export const insertGroupChatSchema = createInsertSchema(chats, {
  name: z.string().trim().min(1, "Name is required").max(50),
})
  .pick({ name: true })
  .extend({
    botIds: z.array(z.string()).min(2, "Pick at least two bots").max(10),
  })

export type InsertGroupChat = z.infer<typeof insertGroupChatSchema>

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

export const usageKind = pgEnum("usage_kind", ["ai_tokens", "sandbox_seconds"])

// Append-only record of metered usage. A user's usage in the current period is
// the sum of their rows since the period started.
export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(), // Clerk user id
    kind: usageKind("kind").notNull(),
    amount: integer("amount").notNull(), // tokens or seconds
    botId: text("bot_id"),
    chatId: text("chat_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("usage_ledger_user_kind_idx").on(t.userId, t.kind, t.createdAt)]
)

// A copy of the user's Clerk subscription, kept so background runs (which have
// no Clerk session) can enforce the plan and find the current usage period.
export const usageAccounts = pgTable("usage_accounts", {
  userId: text("user_id").primaryKey(), // Clerk user id
  entitled: boolean("entitled").notNull().default(false),
  // Start of a subscription period; usage periods are monthly from here.
  anchor: timestamp("anchor").notNull(),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
})

export type UsageKind = (typeof usageKind.enumValues)[number]

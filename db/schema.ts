import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { nanoid } from "nanoid"

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

export type Bot = typeof bots.$inferSelect
export type NewBot = typeof bots.$inferInsert

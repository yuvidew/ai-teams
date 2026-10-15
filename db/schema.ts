import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
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

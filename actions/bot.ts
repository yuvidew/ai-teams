"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import { bots, insertBotSchema } from "@/db/schema"

type CreateBotResult =
  | { success: true; id: string }
  | { success: false; error: string }

export async function createBot(input: unknown): Promise<CreateBotResult> {
  const { userId } = await auth()

  if (!userId) {
    return { success: false, error: "You must be signed in to create a bot." }
  }

  const parsed = insertBotSchema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid bot.",
    }
  }

  const { instructions, ...values } = parsed.data

  const [bot] = await db
    .insert(bots)
    .values({ ...values, instructions: instructions || null, userId })
    .returning({ id: bots.id })

  revalidatePath("/")

  return { success: true, id: bot.id }
}

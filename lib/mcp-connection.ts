import { eq } from "drizzle-orm"

import { db } from "@/db"
import { mcpConnections } from "@/db/schema"

/** Records that the user's AI tool has connected (any authenticated MCP call). */
export async function markConnected(userId: string) {
  await db.insert(mcpConnections).values({ userId }).onConflictDoNothing()
}

/** True once the user's AI tool has connected at least once. */
export async function hasConnected(userId: string) {
  const row = await db.query.mcpConnections.findFirst({
    where: eq(mcpConnections.userId, userId),
    columns: { userId: true },
  })

  return !!row
}

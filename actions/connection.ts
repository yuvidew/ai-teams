"use server"

import { auth } from "@clerk/nextjs/server"

import { hasConnected } from "@/lib/mcp-connection"

/** Whether the signed-in user's AI tool has connected yet. Polled by the connect dialog. */
export async function getConnectionStatus(): Promise<{ connected: boolean }> {
  const { userId } = await auth()

  return { connected: userId ? await hasConnected(userId) : false }
}

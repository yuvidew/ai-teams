import { auth } from "@clerk/nextjs/server"
import { verifyClerkToken } from "@clerk/mcp-tools/next"
import type { AuthInfo } from "@modelcontextprotocol/server"

import { markConnected } from "@/lib/mcp-connection"

// MCP clients (Claude Code, Cursor, Codex) sign in through Clerk's OAuth: the
// browser opens a Clerk login, and the client then sends the access token it
// got. The token resolves to the signed-in Clerk user.

export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  const clerkAuth = await auth({ acceptsToken: "oauth_token" })

  // The Clerk helper types its result with the MCP SDK v1 AuthInfo; the shape
  // is the same as the v2 one this app uses.
  const authInfo = verifyClerkToken(clerkAuth, bearerToken) as
    | AuthInfo
    | undefined
  const userId = authInfo?.extra?.userId

  // The app gates itself on this: the first call from Claude Code opens it up.
  if (typeof userId === "string") await markConnected(userId)

  return authInfo
}

/** The Clerk user id the verified token belongs to. */
export function getMcpUserId(authInfo?: AuthInfo): string {
  const userId = authInfo?.extra?.userId

  if (typeof userId !== "string") throw new Error("Not signed in.")

  return userId
}

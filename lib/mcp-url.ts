import { headers } from "next/headers"

/** The public origin of this app, taken from the request. */
export async function getAppOrigin() {
  try {
    const requestHeaders = await headers()
    const host =
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
    const protocol =
      requestHeaders.get("x-forwarded-proto") ??
      (host?.startsWith("localhost") ? "http" : "https")

    return `${protocol}://${host}`
  } catch {
    // No request scope: fall back to the configured URL, or a relative link.
    return process.env.NEXT_PUBLIC_APP_URL ?? ""
  }
}

/** The public URL of this app's MCP endpoint, taken from the request. */
export async function getMcpUrl() {
  return `${await getAppOrigin()}/api/mcp`
}

/** The web page of a chat, to hand to the user when a task is done. */
export async function getChatUrl(chatId: string) {
  return `${await getAppOrigin()}/chats/${chatId}`
}

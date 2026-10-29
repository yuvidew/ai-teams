import { headers } from "next/headers"

/** The public URL of this app's MCP endpoint, taken from the request. */
export async function getMcpUrl() {
  const requestHeaders = await headers()
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https")

  return `${protocol}://${host}/api/mcp`
}

import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandlerClerk,
} from "@clerk/mcp-tools/next"

// Tells MCP clients that Clerk is the authorization server for /api/mcp.
const handler = protectedResourceHandlerClerk()

const options = metadataCorsOptionsRequestHandler()

export { handler as GET, options as OPTIONS }

import {
  authServerMetadataHandlerClerk,
  metadataCorsOptionsRequestHandler,
} from "@clerk/mcp-tools/next"

// Older MCP clients look for the authorization server's metadata on this app.
const handler = authServerMetadataHandlerClerk()

const options = metadataCorsOptionsRequestHandler()

export { handler as GET, options as OPTIONS }

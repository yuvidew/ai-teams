// headersHelper for Claude Code's Pipedream MCP servers. Claude Code runs this
// on every connect and prints the JSON it writes to stdout as HTTP headers.
//
// A server named `pipedream-<app>` (for example `pipedream-gmail`) is pointed
// at that Pipedream app. Credentials come from .env.local, so no secret is
// stored in Claude Code's config.
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function loadEnv(file) {
  const env = {}

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)

    if (match) env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2")
  }

  return env
}

const env = { ...loadEnv(join(root, ".env.local")), ...process.env }
const {
  PIPEDREAM_CLIENT_ID,
  PIPEDREAM_CLIENT_SECRET,
  PIPEDREAM_PROJECT_ID,
  PIPEDREAM_ENVIRONMENT = "development",
  PIPEDREAM_EXTERNAL_USER_ID = "ai-teams-user",
} = env

const app = (process.env.CLAUDE_CODE_MCP_SERVER_NAME ?? "").replace(
  /^pipedream-/,
  ""
)

if (!PIPEDREAM_CLIENT_ID || !PIPEDREAM_CLIENT_SECRET || !PIPEDREAM_PROJECT_ID) {
  console.error("Set PIPEDREAM_CLIENT_ID, _CLIENT_SECRET and _PROJECT_ID.")
  process.exit(1)
}

if (!app || app === "pipedream") {
  console.error("Name the server pipedream-<app>, for example pipedream-gmail.")
  process.exit(1)
}

const response = await fetch("https://api.pipedream.com/v1/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    grant_type: "client_credentials",
    client_id: PIPEDREAM_CLIENT_ID,
    client_secret: PIPEDREAM_CLIENT_SECRET,
  }),
})

if (!response.ok) {
  console.error(`Pipedream token request failed: ${response.status}`)
  process.exit(1)
}

const { access_token } = await response.json()

console.log(
  JSON.stringify({
    Authorization: `Bearer ${access_token}`,
    "x-pd-project-id": PIPEDREAM_PROJECT_ID,
    "x-pd-environment": PIPEDREAM_ENVIRONMENT,
    "x-pd-external-user-id": PIPEDREAM_EXTERNAL_USER_ID,
    "x-pd-app-slug": app,
  })
)

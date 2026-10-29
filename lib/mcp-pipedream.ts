// Pipedream Connect, so a bot can act in the user's other apps (Gmail, Slack,
// Notion, ...). The user signs in to each app once through a Pipedream connect
// link; Pipedream stores the tokens. Everything is keyed by the Clerk user id,
// which is Pipedream's `external_user_id`, so one user never sees another's
// accounts.

const API = "https://api.pipedream.com/v1"
const MCP = "https://remote.mcp.pipedream.net/v3"

// Pipedream app slugs are lowercase words, e.g. gmail, slack, notion.
const APP_SLUG = /^[a-z0-9_]{1,64}$/

function config() {
  const clientId = process.env.PIPEDREAM_CLIENT_ID
  const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET
  const projectId = process.env.PIPEDREAM_PROJECT_ID
  const environment = process.env.PIPEDREAM_ENVIRONMENT ?? "development"

  if (!clientId || !clientSecret || !projectId) {
    throw new Error(
      "Pipedream is not configured: set PIPEDREAM_CLIENT_ID, PIPEDREAM_CLIENT_SECRET and PIPEDREAM_PROJECT_ID."
    )
  }

  return { clientId, clientSecret, projectId, environment }
}

export function assertAppSlug(app: string) {
  if (!APP_SLUG.test(app)) {
    throw new Error(
      `"${app}" is not an app slug. Use the lowercase name, like gmail, slack or notion.`
    )
  }
}

let cachedToken: { value: string; expiresAt: number } | undefined

// Pipedream access tokens last about an hour; reuse one until shortly before.
async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }

  const { clientId, clientSecret } = config()
  const response = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!response.ok) {
    throw new Error(`Could not sign in to Pipedream (${response.status}).`)
  }

  const { access_token, expires_in } = (await response.json()) as {
    access_token: string
    expires_in: number
  }

  cachedToken = {
    value: access_token,
    expiresAt: Date.now() + expires_in * 1000,
  }

  return access_token
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { projectId, environment } = config()
  const response = await fetch(`${API}/connect/${projectId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "x-pd-environment": environment,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Pipedream request failed (${response.status}).`)
  }

  return (await response.json()) as T
}

/**
 * A link the user opens once to sign in to an app. With `app` it opens that
 * app's sign-in directly; without, Pipedream shows a picker.
 */
export async function createConnectLink(userId: string, app?: string) {
  if (app) assertAppSlug(app)

  const { connect_link_url, expires_at } = await api<{
    connect_link_url: string
    expires_at: string
  }>("/tokens", {
    method: "POST",
    body: JSON.stringify({ external_user_id: userId }),
  })

  return {
    url: app ? `${connect_link_url}&app=${app}` : connect_link_url,
    expiresAt: expires_at,
  }
}

export type ConnectedApp = {
  app: string
  name: string
  accountId: string
  healthy: boolean
}

/** The apps this user has signed in to. */
export async function listConnectedApps(userId: string) {
  const { data } = await api<{
    data: {
      id: string
      healthy?: boolean
      dead?: boolean
      app?: { name_slug?: string; name?: string }
    }[]
  }>(`/accounts?external_user_id=${encodeURIComponent(userId)}`)

  return data.map((account): ConnectedApp => ({
    app: account.app?.name_slug ?? "unknown",
    name: account.app?.name ?? account.app?.name_slug ?? "Unknown",
    accountId: account.id,
    healthy: account.healthy !== false && !account.dead,
  }))
}

export type AppTool = {
  name: string
  description?: string
  inputSchema?: unknown
}

type JsonRpcResponse<T> = {
  result?: T
  error?: { code: number; message: string }
}

// Pipedream's MCP server answers as plain JSON or as one server-sent event,
// depending on the client. Handle both.
function parseRpc<T>(body: string): JsonRpcResponse<T> {
  const trimmed = body.trim()

  if (trimmed.startsWith("{")) return JSON.parse(trimmed)

  const data = trimmed
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("")

  if (!data) throw new Error("Pipedream sent an empty response.")

  return JSON.parse(data)
}

async function appRpc<T>(
  userId: string,
  app: string,
  method: string,
  params?: unknown
): Promise<T> {
  assertAppSlug(app)

  const { projectId, environment } = config()
  const response = await fetch(MCP, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "x-pd-project-id": projectId,
      "x-pd-environment": environment,
      "x-pd-external-user-id": userId,
      "x-pd-app-slug": app,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })

  if (!response.ok) {
    throw new Error(`Pipedream ${app} request failed (${response.status}).`)
  }

  const { result, error } = parseRpc<T>(await response.text())

  if (error) throw new Error(error.message)

  return result as T
}

/** The actions an app offers, such as slack-send-message. */
export async function listAppTools(userId: string, app: string) {
  const { tools } = await appRpc<{ tools: AppTool[] }>(
    userId,
    app,
    "tools/list"
  )

  return tools
}

/**
 * The connect link inside a tool reply, if the user has not signed in to the
 * app yet. Pipedream marks such a reply with `accountRequired`.
 */
export function findConnectUrl(result: { content?: unknown[] }) {
  for (const item of result.content ?? []) {
    const entry = item as { accountRequired?: boolean; connectUrl?: string }

    if (entry.accountRequired && entry.connectUrl) return entry.connectUrl
  }

  return null
}

/** Polls until the user has signed in to `app`, or `timeoutMs` passes. */
export async function waitForAppConnection(
  userId: string,
  app: string,
  timeoutMs: number
) {
  assertAppSlug(app)

  const deadline = Date.now() + timeoutMs

  while (true) {
    const apps = await listConnectedApps(userId)

    if (apps.some((item) => item.app === app && item.healthy)) return true
    if (Date.now() + 3000 > deadline) return false

    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
}

/**
 * Runs one of an app's actions as the user. If the user has not signed in to
 * the app yet, Pipedream's reply holds a connect link, which comes back as
 * ordinary content for the caller to show.
 */
export async function callAppTool(
  userId: string,
  app: string,
  name: string,
  args: Record<string, unknown>
) {
  return appRpc<{
    content?: unknown[]
    isError?: boolean
  }>(userId, app, "tools/call", { name, arguments: args })
}

import { Daytona, type Sandbox } from "@daytona/sdk"

// The endpoint and key are passed explicitly: when DAYTONA_API_URL comes from
// both a .env file and the process environment (as in the Trigger.dev dev
// worker), the SDK refuses to guess which one is meant.
const daytona = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY,
  apiUrl: process.env.DAYTONA_API_URL,
  target: process.env.DAYTONA_TARGET,
})

/** Creates a sandbox for a bot and returns its id. Nothing is run in it. */
export async function createBotSandbox(botId: string): Promise<string> {
  const sandbox = await daytona.create({ labels: { botId } })
  return sandbox.id
}

/** Deletes a bot's sandbox. A sandbox that is already gone is not an error. */
export async function deleteBotSandbox(sandboxId: string): Promise<void> {
  let sandbox
  try {
    sandbox = await daytona.get(sandboxId)
  } catch {
    return
  }
  await daytona.delete(sandbox)
}

/** Fetches a bot's sandbox and starts it if it was stopped (e.g. auto-stop). */
export async function getStartedSandbox(sandboxId: string): Promise<Sandbox> {
  const sandbox = await daytona.get(sandboxId)

  if (sandbox.state !== "started") {
    await sandbox.start()
  }

  return sandbox
}

// noVNC is served by the sandbox's desktop on this port.
const VNC_PORT = 6080

/**
 * Starts the sandbox's desktop (VNC) processes and returns a URL that opens the
 * noVNC client, already connected and scaled to fit its frame. The URL is a
 * signed preview link, so it works inside an iframe without custom headers.
 */
export async function getSandboxVncUrl(sandboxId: string): Promise<string> {
  const sandbox = await getStartedSandbox(sandboxId)

  await sandbox.computerUse.start()

  const { url } = await sandbox.getSignedPreviewUrl(VNC_PORT, 60 * 60 * 24)
  const params = new URLSearchParams({
    autoconnect: "true",
    resize: "scale",
    reconnect: "true",
  })

  return `${url.replace(/\/$/, "")}/vnc.html?${params}`
}

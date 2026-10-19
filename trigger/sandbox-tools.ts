import type { Sandbox } from "@daytona/sdk"
import { tool } from "ai"
import { z } from "zod"

const MAX_TEXT = 20_000

const clip = (text: string) =>
  text.length > MAX_TEXT
    ? `${text.slice(0, MAX_TEXT)}\n... [truncated ${text.length - MAX_TEXT} characters]`
    : text

const point = {
  x: z.number().int().min(0).describe("Horizontal pixel, 0 is the left edge"),
  y: z.number().int().min(0).describe("Vertical pixel, 0 is the top edge"),
}

/**
 * The agent's hands inside its Daytona sandbox: a shell, the filesystem and a
 * desktop it can see and control. `getSandbox` resolves the (started) sandbox
 * lazily, so a turn that uses no tool never wakes it up.
 */
export function createSandboxTools(getSandbox: () => Promise<Sandbox>) {
  // The desktop (Xvfb, xfce, VNC) only runs after computerUse.start(); do it
  // once per run, on the first computer-use call.
  let desktop: Promise<Sandbox> | undefined
  const getDesktop = () =>
    (desktop ??= getSandbox().then(async (sandbox) => {
      await sandbox.computerUse.start()
      return sandbox
    }))
  // A failed start must not stick: let the next call try again.
  const requireDesktop = async () => {
    try {
      return await getDesktop()
    } catch (error) {
      desktop = undefined
      throw error
    }
  }

  async function takeScreenshot() {
    const sandbox = await requireDesktop()
    const [shot, info] = await Promise.all([
      sandbox.computerUse.screenshot.takeCompressed({
        format: "jpeg",
        quality: 70,
        showCursor: true,
      }),
      sandbox.computerUse.display.getInfo(),
    ])

    if (!shot.screenshot) throw new Error("The screenshot came back empty.")

    const display = info.displays?.[0]

    return {
      image: shot.screenshot,
      mediaType: "image/jpeg" as const,
      width: display?.width ?? null,
      height: display?.height ?? null,
    }
  }

  return {
    bash: tool({
      description:
        "Run a shell command in your sandbox (Linux, bash). Returns the combined output and the exit code. Commands are not interactive and are stopped after the timeout, so start long-running servers and desktop programs in the background (for example with nohup ... &).",
      inputSchema: z.object({
        command: z.string().min(1).describe("The shell command to run"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory. Defaults to the sandbox home."),
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(300)
          .optional()
          .describe("Give up after this many seconds. Defaults to 60."),
      }),
      execute: async ({ command, cwd, timeoutSeconds }) => {
        const sandbox = await getSandbox()
        const result = await sandbox.process.executeCommand(
          command,
          cwd,
          // Lets commands open windows on the desktop the agent can see.
          { DISPLAY: ":0" },
          timeoutSeconds ?? 60
        )

        return { output: clip(result.result), exitCode: result.exitCode }
      },
    }),

    readFile: tool({
      description:
        "Read a text file from your sandbox. Long files are truncated.",
      inputSchema: z.object({
        path: z.string().min(1).describe("Absolute path, or relative to home"),
      }),
      execute: async ({ path }) => {
        const sandbox = await getSandbox()
        const buffer = await sandbox.fs.downloadFile(path)

        return { path, content: clip(buffer.toString("utf-8")) }
      },
    }),

    writeFile: tool({
      description:
        "Write a text file in your sandbox, replacing it if it exists. Parent directories are created.",
      inputSchema: z.object({
        path: z.string().min(1).describe("Absolute path, or relative to home"),
        content: z.string().describe("The full new contents of the file"),
      }),
      execute: async ({ path, content }) => {
        const sandbox = await getSandbox()
        const buffer = Buffer.from(content, "utf-8")
        const dir = path.includes("/")
          ? path.slice(0, path.lastIndexOf("/"))
          : ""

        if (dir) await sandbox.fs.createFolder(dir, "755")
        await sandbox.fs.uploadFile(buffer, path)

        return { path, bytes: buffer.length }
      },
    }),

    listFiles: tool({
      description: "List the files and folders in a directory of your sandbox.",
      inputSchema: z.object({
        path: z
          .string()
          .default(".")
          .describe("Directory to list. Defaults to home."),
      }),
      execute: async ({ path }) => {
        const sandbox = await getSandbox()
        const files = await sandbox.fs.listFiles(path)

        return {
          path,
          entries: files.map((file) => ({
            name: file.name,
            type: file.isDir ? ("directory" as const) : ("file" as const),
            size: file.size,
          })),
        }
      },
    }),

    mouseClick: tool({
      description:
        "Click the mouse at a point on the screen. Use viewScreen first to find the coordinates.",
      inputSchema: z.object({
        ...point,
        button: z.enum(["left", "right", "middle"]).default("left"),
        double: z.boolean().default(false).describe("Double-click"),
      }),
      execute: async ({ x, y, button, double }) => {
        const sandbox = await requireDesktop()
        await sandbox.computerUse.mouse.click(x, y, button, double)

        return { x, y, button, double }
      },
    }),

    mouseMove: tool({
      description: "Move the mouse pointer to a point on the screen.",
      inputSchema: z.object(point),
      execute: async ({ x, y }) => {
        const sandbox = await requireDesktop()
        await sandbox.computerUse.mouse.move(x, y)

        return { x, y }
      },
    }),

    mouseScroll: tool({
      description:
        "Scroll the mouse wheel at a point on the screen. One tick is about one notch of a physical wheel.",
      inputSchema: z.object({
        ...point,
        direction: z.enum(["up", "down", "left", "right"]),
        amount: z.number().int().min(1).max(50).default(3).describe("Ticks"),
      }),
      execute: async ({ x, y, direction, amount }) => {
        const sandbox = await requireDesktop()
        await sandbox.computerUse.mouse.scroll(x, y, direction, amount)

        return { x, y, direction, amount }
      },
    }),

    keyboardType: tool({
      description:
        "Type text into whatever has focus. A newline is typed as Enter. Click the target first.",
      inputSchema: z.object({
        text: z.string().min(1).describe("The text to type"),
      }),
      execute: async ({ text }) => {
        const sandbox = await requireDesktop()
        await sandbox.computerUse.keyboard.type(text)

        return { characters: text.length }
      },
    }),

    keyboardPress: tool({
      description:
        "Press one key, optionally with modifiers held, like Enter, Escape, Tab, an arrow key, or Ctrl+C.",
      inputSchema: z.object({
        key: z
          .string()
          .min(1)
          .describe(
            "Key name such as enter, escape, tab, backspace, up, down, f5, or a single letter"
          ),
        modifiers: z
          .array(z.enum(["ctrl", "alt", "shift", "cmd"]))
          .default([])
          .describe("Modifier keys to hold while pressing the key"),
      }),
      execute: async ({ key, modifiers }) => {
        const sandbox = await requireDesktop()
        await sandbox.computerUse.keyboard.press(key, modifiers)

        return { key, modifiers }
      },
    }),

    viewScreen: tool({
      description:
        "Take a screenshot of your screen so that you can see it. Only you see it, the user does not. Use it before clicking and after acting to check what happened.",
      inputSchema: z.object({}),
      execute: takeScreenshot,
      // The model gets the picture itself; the JSON result is only for the UI.
      toModelOutput: ({ output }) => ({
        type: "content",
        value: [
          {
            type: "text",
            text: `Screenshot of the screen${
              output.width && output.height
                ? `, ${output.width}x${output.height} pixels`
                : ""
            }. Mouse and click coordinates use this pixel space.`,
          },
          {
            type: "file",
            data: { type: "data", data: output.image },
            mediaType: output.mediaType,
          },
        ],
      }),
    }),

    showScreen: tool({
      description:
        "Show the user a screenshot of your screen in the chat. Use it when the user asks what is on the screen or wants to see it. You do not see the picture yourself, call viewScreen for that.",
      inputSchema: z.object({}),
      execute: takeScreenshot,
      toModelOutput: () => ({
        type: "text",
        value: "The screenshot was shown to the user.",
      }),
    }),
  }
}

export type SandboxTools = ReturnType<typeof createSandboxTools>

"use client"

import {
  EyeIcon,
  FileTextIcon,
  FolderOpenIcon,
  KeyboardIcon,
  MonitorIcon,
  MousePointer2Icon,
  MousePointerClickIcon,
  MoveIcon,
  PencilLineIcon,
  TerminalIcon,
  type LucideIcon,
} from "lucide-react"

import type { ChatUIMessage } from "@/trigger/chat"
import { CodeBlock } from "@/components/ai-elements/code-block"
import { Image } from "@/components/ai-elements/image"
import { Terminal } from "@/components/ai-elements/terminal"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  getStatusBadge,
} from "@/components/ai-elements/tool"
import { cn } from "@/lib/utils"

type Part = ChatUIMessage["parts"][number]
// Only the tool parts of a message; text, reasoning etc. are handled by the chat.
// The handoff tool is rendered by the chat itself, not as a tool row.
type ToolPart = Exclude<
  Extract<Part, { type: `tool-${string}` }>,
  { type: "tool-handoff" }
>

export const isToolPart = (part: Part): part is ToolPart =>
  part.type.startsWith("tool-") && part.type !== "tool-handoff"

const ICONS: Record<ToolPart["type"], LucideIcon> = {
  "tool-bash": TerminalIcon,
  "tool-readFile": FileTextIcon,
  "tool-writeFile": PencilLineIcon,
  "tool-listFiles": FolderOpenIcon,
  "tool-mouseClick": MousePointerClickIcon,
  "tool-mouseMove": MoveIcon,
  "tool-mouseScroll": MousePointer2Icon,
  "tool-keyboardType": KeyboardIcon,
  "tool-keyboardPress": KeyboardIcon,
  "tool-viewScreen": EyeIcon,
  "tool-showScreen": MonitorIcon,
}

const clipText = (text: string, max = 60) =>
  text.length > max ? `${text.slice(0, max)}…` : text

// A one-line description of what the agent is doing. The input can still be
// streaming in, so every field is optional.
function titleOf(part: ToolPart): string {
  switch (part.type) {
    case "tool-bash":
      return part.input?.command
        ? `Run ${clipText(part.input.command)}`
        : "Run command"
    case "tool-readFile":
      return `Read ${part.input?.path ?? "file"}`
    case "tool-writeFile":
      return `Write ${part.input?.path ?? "file"}`
    case "tool-listFiles":
      return `List ${part.input?.path ?? "files"}`
    case "tool-mouseClick": {
      const input = part.input
      const kind = input?.double ? "Double-click" : "Click"
      return input?.x !== undefined && input?.y !== undefined
        ? `${kind} at (${input.x}, ${input.y})`
        : kind
    }
    case "tool-mouseMove":
      return part.input?.x !== undefined && part.input?.y !== undefined
        ? `Move mouse to (${part.input.x}, ${part.input.y})`
        : "Move mouse"
    case "tool-mouseScroll":
      return part.input?.direction ? `Scroll ${part.input.direction}` : "Scroll"
    case "tool-keyboardType":
      return part.input?.text
        ? `Type “${clipText(part.input.text, 40)}”`
        : "Type"
    case "tool-keyboardPress": {
      const input = part.input
      if (!input?.key) return "Press key"
      return `Press ${[...(input.modifiers ?? []), input.key].join("+")}`
    }
    case "tool-viewScreen":
      return "Looked at the screen"
    case "tool-showScreen":
      return "Show screen"
  }
}

function ToolBody({ part }: { part: ToolPart }) {
  if (part.state === "output-error") {
    return <ToolOutput errorText={part.errorText} output={undefined} />
  }

  switch (part.type) {
    case "tool-bash": {
      const command = part.input?.command ?? ""
      const output =
        part.state === "output-available"
          ? `${part.output.output}${
              part.output.exitCode === 0
                ? ""
                : `\n[exit code ${part.output.exitCode}]`
            }`
          : ""

      return (
        <Terminal
          isStreaming={part.state !== "output-available"}
          output={`$ ${command}\n${output}`}
        />
      )
    }

    case "tool-readFile":
      return part.state === "output-available" ? (
        <CodeBlock code={part.output.content} language="log" />
      ) : null

    case "tool-writeFile":
      return (
        <>
          {part.input?.content !== undefined && (
            <CodeBlock code={part.input.content} language="log" />
          )}
          {part.state === "output-available" && (
            <p className="text-xs text-muted-foreground">
              Wrote {part.output.bytes} bytes
            </p>
          )}
        </>
      )

    case "tool-listFiles":
      return part.state === "output-available" ? (
        part.output.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Empty directory</p>
        ) : (
          <ul className="font-mono text-sm">
            {part.output.entries.map((entry) => (
              <li className="flex justify-between gap-4" key={entry.name}>
                <span>
                  {entry.name}
                  {entry.type === "directory" && "/"}
                </span>
                {entry.type === "file" && (
                  <span className="text-muted-foreground">{entry.size} B</span>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null

    case "tool-showScreen":
      return part.state === "output-available" ? (
        <Image
          alt="The agent's screen"
          base64={part.output.image}
          mediaType={part.output.mediaType}
          uint8Array={new Uint8Array()}
        />
      ) : null

    // viewScreen never reaches here: it renders as a plain row.
    default:
      return <ToolInput input={part.input} />
  }
}

// Renders one tool call of the agent. `viewScreen` is the agent looking for
// itself, so the screenshot is never shown, only that it happened.
export function ToolCall({ part }: { part: ToolPart }) {
  const Icon = ICONS[part.type]

  if (part.type === "tool-viewScreen") {
    return (
      <div
        className={cn(
          "not-prose mb-4 flex items-center gap-2 rounded-md border p-3 text-sm"
        )}
      >
        <Icon className="size-4 text-muted-foreground" />
        <span className="font-medium">{titleOf(part)}</span>
        {getStatusBadge(part.state)}
      </div>
    )
  }

  return (
    <Tool defaultOpen={part.type === "tool-showScreen"}>
      <ToolHeader state={part.state} title={titleOf(part)} type={part.type} />
      <ToolContent>
        <ToolBody part={part} />
      </ToolContent>
    </Tool>
  )
}

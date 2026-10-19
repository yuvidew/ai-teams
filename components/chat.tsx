"use client"

import { useChat } from "@ai-sdk/react"
import { useState } from "react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"

import {
  loadTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"
import { ChatAvatar } from "@/components/chat-avatar"
import { Badge } from "@/components/ui/badge"
import { ToolCall, isToolPart } from "@/components/tool-call"
import type { ChatBot } from "@/queries/chats"
import type { aiChat, ChatUIMessage } from "@/trigger/chat"
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"

// Loads the saved transcript for this chat, then mounts the live chat on top
// of it so `useChat`'s initial messages and the transport cursor agree.
function Chat({ chatId, bots }: { chatId: string; bots: ChatBot[] }) {
  const transport = useTriggerChatTransport<typeof aiChat>({
    task: "ai-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
  })
  const { messages, isLoading } = useLoadTranscript<ChatUIMessage>(
    chatId,
    loadTranscript,
    {
      transport,
    }
  )

  if (isLoading) return <div className="min-h-0 flex-1" />

  return (
    <ChatView
      chatId={chatId}
      bots={bots}
      initialMessages={messages}
      transport={transport}
    />
  )
}

function BotOption({ bot }: { bot: ChatBot }) {
  return (
    <span className="flex items-center gap-2">
      <ChatAvatar seed={bot.avatar} className="size-5" />
      {bot.name}
    </span>
  )
}

type HandoffPart = Extract<
  ChatUIMessage["parts"][number],
  { type: "tool-handoff" }
>

// A bot passing the request on: a one-line note, then the other bot's reply
// (streamed in as preliminary tool output) with its own avatar.
function Handoff({ part, bots }: { part: HandoffPart; bots: ChatBot[] }) {
  const output = part.output
  const reply = output && "reply" in output ? output : undefined
  const target = bots.find((bot) => bot.id === reply?.botId)

  return (
    <>
      <p className="text-xs text-muted-foreground">
        {part.input?.botName
          ? `Handed off to ${part.input.botName}${part.input.reason ? `: ${part.input.reason}` : ""}`
          : "Handing off…"}
      </p>
      {output && "error" in output && (
        <p className="text-xs text-destructive">{output.error}</p>
      )}
      {reply && (
        <div className="flex items-start gap-3">
          {target && (
            <ChatAvatar seed={target.avatar} className="size-8 shrink-0" />
          )}
          <MessageResponse>{reply.reply}</MessageResponse>
        </div>
      )}
    </>
  )
}

function ChatView({
  chatId,
  bots,
  initialMessages,
  transport,
}: {
  chatId: string
  bots: ChatBot[]
  initialMessages: ChatUIMessage[]
  transport: ReturnType<typeof useTriggerChatTransport<typeof aiChat>>
}) {
  const { messages, sendMessage, status, stop, error } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    resume: initialMessages.length > 0,
  })

  // In a group chat the user picks which bot answers each message.
  const [botId, setBotId] = useState(bots[0].id)
  const isGroup = bots.length > 1

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.map((message, index) => {
            // The server stamps replies with the answering bot. Failing that
            // (e.g. while streaming), it is the bot the preceding user message
            // was addressed to.
            const authorId =
              message.metadata?.botId ??
              messages
                .slice(0, index)
                .findLast((previous) => previous.role === "user")?.metadata
                ?.botId
            const author =
              isGroup && message.role === "assistant"
                ? bots.find((bot) => bot.id === authorId)
                : undefined

            // Which bot a user message was addressed to.
            const addressee =
              isGroup && message.role === "user"
                ? bots.find((bot) => bot.id === message.metadata?.botId)
                : undefined

            return (
              <Message
                from={message.role}
                key={message.id}
                className={author && "flex-row items-start gap-3"}
              >
                {author && (
                  <ChatAvatar
                    seed={author.avatar}
                    className="size-8 shrink-0"
                  />
                )}
                <MessageContent>
                  {message.parts.map((part, index) => {
                    if (part.type === "text" && addressee) {
                      // Reads like the user tagged the bot at the start of the line.
                      return (
                        <p key={index} className="whitespace-pre-wrap">
                          <Badge
                            variant="secondary"
                            className="mr-1.5 inline-flex max-w-32 pl-0.5 align-middle"
                          >
                            <ChatAvatar
                              seed={addressee.avatar}
                              className="size-4"
                            />
                            <span className="truncate">{addressee.name}</span>
                          </Badge>
                          {part.text}
                        </p>
                      )
                    }

                    if (part.type === "text") {
                      return (
                        <MessageResponse key={index}>
                          {part.text}
                        </MessageResponse>
                      )
                    }

                    if (part.type === "tool-handoff") {
                      return (
                        <Handoff
                          key={part.toolCallId}
                          part={part}
                          bots={bots}
                        />
                      )
                    }

                    if (isToolPart(part)) {
                      return <ToolCall key={part.toolCallId} part={part} />
                    }

                    return null
                  })}
                </MessageContent>
              </Message>
            )
          })}
        </ConversationContent>
        <ConversationScrollButton />
        {error && (
          <p className="p-4 text-center text-sm text-destructive">
            Couldn&apos;t get a reply. Please try again.
          </p>
        )}
      </Conversation>
      <PromptInput
        className="mx-auto w-full max-w-3xl p-4"
        onSubmit={({ text }) => {
          if (!text.trim()) return

          // Per-message metadata reaches the agent as `clientData` for the turn.
          // The user message keeps the addressee too, so a reply can be
          // attributed even before the server's stamp arrives.
          sendMessage(
            isGroup ? { text, metadata: { botId } } : { text },
            isGroup ? { metadata: { botId } } : undefined
          )
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea placeholder="Say something..." />
        </PromptInputBody>
        <PromptInputFooter className={isGroup ? undefined : "justify-end"}>
          {isGroup && (
            <PromptInputTools>
              <PromptInputSelect
                value={botId}
                onValueChange={(value) => {
                  if (typeof value === "string") setBotId(value)
                }}
                items={bots.map((bot) => ({
                  value: bot.id,
                  label: <BotOption bot={bot} />,
                }))}
              >
                <PromptInputSelectTrigger aria-label="Bot to talk to">
                  <PromptInputSelectValue />
                </PromptInputSelectTrigger>
                <PromptInputSelectContent>
                  {bots.map((bot) => (
                    <PromptInputSelectItem key={bot.id} value={bot.id}>
                      <BotOption bot={bot} />
                    </PromptInputSelectItem>
                  ))}
                </PromptInputSelectContent>
              </PromptInputSelect>
            </PromptInputTools>
          )}
          <PromptInputSubmit status={status} onStop={stop} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}

export { Chat }

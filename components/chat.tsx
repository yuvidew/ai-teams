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
          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {message.parts.map((part, index) => {
                  if (part.type === "text") {
                    return (
                      <MessageResponse key={index}>{part.text}</MessageResponse>
                    )
                  }

                  if (isToolPart(part)) {
                    return <ToolCall key={part.toolCallId} part={part} />
                  }

                  return null
                })}
              </MessageContent>
            </Message>
          ))}
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
          sendMessage({ text }, isGroup ? { metadata: { botId } } : undefined)
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

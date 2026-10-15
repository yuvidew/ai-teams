"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"

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
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"

// Messages live in memory only; nothing is persisted yet.
function Chat({ chatId }: { chatId: string }) {
  const { messages, sendMessage, status, stop, error } = useChat({
    id: chatId,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {message.parts.map((part, index) =>
                  part.type === "text" ? (
                    <MessageResponse key={index}>{part.text}</MessageResponse>
                  ) : null
                )}
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
          if (text.trim()) sendMessage({ text })
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea placeholder="Say something..." />
        </PromptInputBody>
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit status={status} onStop={stop} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}

export { Chat }

"use client"

import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
  type InferChatUIMessage,
} from "@trigger.dev/sdk/chat/react"

import {
  loadTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"
import type { aiChat } from "@/trigger/chat"
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

// Loads the saved transcript for this chat, then mounts the live chat on top
// of it so `useChat`'s initial messages and the transport cursor agree.
function Chat({ chatId }: { chatId: string }) {
  const transport = useTriggerChatTransport<typeof aiChat>({
    task: "ai-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
  })
  const { messages, isLoading } = useLoadTranscript(chatId, loadTranscript, {
    transport,
  })

  if (isLoading) return <div className="min-h-0 flex-1" />

  return (
    <ChatView
      chatId={chatId}
      initialMessages={messages}
      transport={transport}
    />
  )
}

function ChatView({
  chatId,
  initialMessages,
  transport,
}: {
  chatId: string
  initialMessages: InferChatUIMessage<typeof aiChat>[]
  transport: ReturnType<typeof useTriggerChatTransport<typeof aiChat>>
}) {
  const { messages, sendMessage, status, stop, error } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    resume: initialMessages.length > 0,
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

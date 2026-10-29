"use client"

import { format, isToday, isYesterday } from "date-fns"

import { ChatAvatar } from "@/components/chat-avatar"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Marker, MarkerContent } from "@/components/ui/marker"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import type { ChatBot, ChatMessageRow } from "@/queries/chats"

function dayLabel(date: Date) {
  if (isToday(date)) return "Today"
  if (isYesterday(date)) return "Yesterday"

  return format(date, "MMMM d, yyyy")
}

// Read-only history of a chat. Conversations happen in the user's AI tool over
// MCP, so there is no input here.
function ChatTranscript({
  messages,
  bots,
}: {
  messages: ChatMessageRow[]
  bots: ChatBot[]
}) {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl p-4">
            {messages.map((message, index) => {
              const bot = bots.find((item) => item.id === message.botId)
              const previous = messages[index - 1]
              const newDay =
                !previous ||
                dayLabel(previous.createdAt) !== dayLabel(message.createdAt)

              return (
                <MessageScrollerItem key={message.id} messageId={message.id}>
                  {newDay && (
                    <Marker variant="separator" className="mb-6">
                      <MarkerContent suppressHydrationWarning>
                        {dayLabel(message.createdAt)}
                      </MarkerContent>
                    </Marker>
                  )}
                  <Message align={bot ? "start" : "end"}>
                    {bot && (
                      <MessageAvatar>
                        <ChatAvatar seed={bot.avatar} className="size-8" />
                      </MessageAvatar>
                    )}
                    <MessageContent>
                      <MessageHeader>{bot ? bot.name : "You"}</MessageHeader>
                      <Bubble variant={bot ? "secondary" : "default"}>
                        <BubbleContent className="whitespace-pre-wrap">
                          {message.content}
                        </BubbleContent>
                      </Bubble>
                      <MessageFooter suppressHydrationWarning>
                        {message.mentions.length > 0 &&
                          `To ${message.mentions.join(", ")} · `}
                        {format(message.createdAt, "h:mm a")}
                      </MessageFooter>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )
            })}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

export { ChatTranscript }

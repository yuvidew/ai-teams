import { mistral } from "@ai-sdk/mistral"
import { chat } from "@trigger.dev/sdk/ai"

// One long-lived run per chat. The transcript is kept by the default transcript
// storage, keyed by the chat id (which is also the session id).
export const aiChat = chat.agent({
  id: "ai-chat",
  run: async ({ messages, signal, streamText }) =>
    streamText({
      model: mistral("ministral-8b-latest"),
      messages,
      abortSignal: signal,
    }),
})

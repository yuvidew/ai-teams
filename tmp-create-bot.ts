import { createBotForUser } from "@/lib/create-bot"

const result = await createBotForUser("user_3Kj875WARBccIEkwDKRAHMyuzgM", {
  name: "Scout",
  job: "Finds the latest Cyclops Odyssey updates",
  instructions:
    'Search the web for "Cyclops Odyssey" in the sandbox browser. Look for the newest news, patches, release dates and announcements, from official sources first (official site, Steam page, social accounts) and then reputable gaming news. Report briefly: what is new, the date of each item, and a link. Say plainly when you cannot find anything recent.',
})

console.log(JSON.stringify(result))

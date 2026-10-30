# AI Teams: Launch Post

Replace `<LIVE_DEMO_URL>` before posting. Everything else is taken from the repo and git history.

---

## LinkedIn post (main)

🚀 **I built AI Teams: a team of AI bots that work on real Linux desktops, controlled from the AI tool you already use.**

Imagine telling Claude Code: *"Create a bot called Ada, open Chromium in its sandbox and research this topic."*
Ada spins up her own private cloud computer, opens the browser, clicks, types, takes screenshots, and writes it all into a chat you can open in the web app. You can even **watch her screen live**. 🖥️

Here's the twist: **the app makes zero AI calls itself.** Your AI tool (Claude Code, Codex or Cursor) is the brain. My app is the body: memory, sandbox, apps and a dashboard.

### ✨ What it does
- 🤖 **27 MCP tools** that any MCP-capable AI tool can call
- 🖥️ **A private Linux desktop per bot** (Daytona), with live noVNC view and fullscreen mode
- 👥 **Group chats**: several bots collaborate, @mention each other, hand off work
- 📬 **Acts in your real apps**: Gmail, Slack, Notion and more via Pipedream, with a one-time sign-in link
- 🧠 **Per-bot memory file**, so bots remember across chats
- 🔐 **Clerk OAuth** sign-in for both the web app and the MCP connection
- ⚡ Live chat updates, Cmd/Ctrl+K search, collapsible sidebar

### 🧱 Stack
Next.js 16 · React 19 · TypeScript · Tailwind 4 · shadcn/Base UI · Clerk · Neon Postgres · Drizzle · MCP · Daytona · Pipedream · Sentry · Vercel

### 🐛 The honest part: problems I ran into
I did a full code review of my own project and found **11 problem areas**. Some I'd already fought and fixed while building, others are still on my list.

**Problems I solved while building 💪**
1. **Daytona SDK leaking into the client bundle** → moved all sandbox code behind server-only modules so the browser never imports it.
2. **File upload crashing in Next's server bundle** (the SDK needs a runtime `require`) → switched to a plain shell command, which works everywhere.
3. **Half-created bots** (sandbox made, database insert fails) → added cleanup so a failed insert deletes the sandbox, and one batched insert keeps bot + chat + member atomic.
4. **Pipedream hiding the connect link** (it validates inputs before checking the account) → I now check the connected account first, so the user always gets the sign-in link.
5. **Noisy chat logs** ("use the bot X and send hello" showing up as the message) → rewrote the tool instructions so only the bare content, like "Hello", is logged.
6. **Group work invisible in each bot's own chat** → group messages now mirror into the right bot's one-on-one chat automatically.
7. **Group chats missing from the sidebar** → fixed the query so groups appear next to direct chats.
8. **Chat page not updating** while bots work over MCP → added live refresh so new messages and new bots appear on their own.
9. **VNC screen reloading every time it moved** → one floating iframe laid over whichever slot is active, so the live desktop never reconnects.
10. **Too much architecture** → I removed my first Trigger.dev chat agent and billing and went MCP-only. Less code, simpler product.

**Still on my fix list 🛠️** (found in my self-review)
- Group chat page still shows a single-bot header and a desktop panel that doesn't apply
- Sandbox tools can go stale after Daytona's 5-minute idle stop
- No edit/delete bot tool yet, so old sandboxes keep costing money
- Unused components and packages to clean out

Building in public means showing the bugs too. 😄

### 🔗 Try it / read the code
🌐 **Live demo:** <LIVE_DEMO_URL>
💻 **GitHub:** https://github.com/yuvidew/ai-teams

If you're building with MCP, agents or sandboxes, I'd love your feedback. What should the bots learn to do next? 👇

#AI #MCP #AIAgents #NextJS #TypeScript #BuildInPublic #ClaudeCode #FullStack #OpenSource #Daytona

---

## Short version (for WhatsApp / Instagram / X)

🔥 **I built AI Teams!**

Tell your AI tool (Claude Code / Codex / Cursor): *"Create a bot, open a browser in its sandbox and research this topic"*, and the bot works on its own **private Linux desktop**. You can **watch its screen live** 👀

✅ 27 MCP tools
✅ A private sandbox for every bot
✅ Group chats: bots share the work with each other
✅ Real actions in Gmail, Slack and Notion
✅ Bots with memory

**Problems I faced:** I found 11 problem areas. The Daytona SDK leaking into the browser bundle, the Pipedream connect link disappearing, half-created bots, and a group chat sidebar bug. I solved many of them: server-only modules, checking the account first, cleanup when an insert fails, and live chat refresh. A few are still open, and they are on my list too 😄

🌐 Live demo: <LIVE_DEMO_URL>
💻 GitHub: https://github.com/yuvidew/ai-teams

#BuildInPublic #AI #MCP #NextJS

---

## Tips before you post
- **Add a screenshot or 20-second screen recording** of a bot's desktop working. Posts with a visual do much better. The live desktop panel is your best shot.
- Put the live link in the **first comment too**, since LinkedIn sometimes reduces reach for posts with links in the body.
- Make sure the demo works for a new visitor (sign-up, connect dialog) and that no secrets are in the repo. `.env.local` is git-ignored, but `tmp-create-bot.ts` in the repo has a hardcoded Clerk user id, so delete it before sharing the repo widely.
- Once you fix the "still on my list" items, move them up into the solved list.

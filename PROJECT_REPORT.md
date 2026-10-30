# AI Teams: Project Report

Generated 2026-10-29 from a read-through of the source (not from running it). Nothing here was executed: `typecheck`, `lint` and `build` have **not** been run for this report, so treat "problems" as findings from reading the code, not from a failing build.

---

## 1. What this project is

**AI Teams** is a web dashboard plus an **MCP server**. You create AI "bots" (teammates). Each bot gets its own private Linux desktop sandbox (Daytona). You then drive the bots **from your own AI tool** (Claude Code, Codex or Cursor), which connects to this app over MCP.

Key design choice: **this app makes no AI call of its own.** Your AI tool's model is the bot's brain. The app only:

1. stores bots, chats and messages,
2. hands out a bot's persona (system prompt),
3. runs the bot's sandbox tools (shell, files, mouse, keyboard, screenshots),
4. lets bots act in your other apps (Gmail, Slack, Notion...) through Pipedream,
5. shows the conversation and the bot's live desktop in a web page.

### How the pieces fit

```
Claude Code / Codex / Cursor
        |  MCP over HTTP  (OAuth sign-in through Clerk)
        v
/api/mcp  (Next.js route, mcp-handler)  --->  Neon Postgres (Drizzle)
        |            |
        |            +--->  Pipedream Connect  --->  Gmail / Slack / Notion ...
        v
Daytona sandbox (one per bot: Linux + XFCE desktop + Chromium + VNC)
        ^
        |  noVNC iframe
Web dashboard (Next.js 16, React 19, shadcn/Base UI)  <---  Clerk sign-in
```

### Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.4.0, React 19.3.0, TypeScript 5, Tailwind 4 |
| UI | shadcn + Base UI (`@base-ui/react`), `components/ui`, `components/ai-elements` |
| Auth (web) | Clerk (`@clerk/nextjs`) via `proxy.ts` (`clerkMiddleware`) |
| Auth (MCP) | Clerk OAuth tokens verified with `@clerk/mcp-tools` |
| Database | Neon Postgres, Drizzle ORM, `drizzle-zod` (push-only, no migrations) |
| MCP server | `mcp-handler` + `@modelcontextprotocol/server` |
| Sandboxes | Daytona SDK (`@daytona/sdk`) |
| App connections | Pipedream Connect (Gmail, Slack, Notion, ...) |
| Avatars | DiceBear 10 |
| Monitoring | Sentry (Next.js + Trigger.dev worker) |
| Background jobs | Trigger.dev 4.8.1 (currently only an example task) |
| Package manager | bun (`bun.lock`) |
| Hosting | Vercel (`.vercel/` present) |

---

## 2. Feature count

### 2.1 Summary

| Area | Count |
|---|---|
| **MCP tools exposed** | **27** |
| Web pages / routes | 6 (home, chat, sign-in, sign-up, MCP endpoint, 2 OAuth discovery routes) |
| Database tables | 5 (+1 enum) |
| Server actions | 6 (3 are currently unused, see problem P3) |
| Distinct user-facing features | **14** (listed below) |

### 2.2 The 27 MCP tools

**Bots (4)**
| Tool | What it does |
|---|---|
| `list_bots` | List your bots |
| `get_bot` | Return a bot's full instructions; the AI tool "becomes" that bot |
| `create_bot` | Create bot + sandbox + direct chat in one step |
| `log_chat_message` | Write a user/bot message into the bot's one-on-one chat; returns the chat link |

**Groups (6)**
| Tool | What it does |
|---|---|
| `create_group` | Group of 2+ bots |
| `add_bot_to_group` | Add a bot to a group |
| `list_groups` | List groups and members |
| `get_group` | Members, recent messages and the collaboration instructions |
| `post_group_message` | Post as a bot (or as the user) with `@mentions`; mirrors into each bot's own chat |
| `read_group_messages` | Read the transcript, optionally only messages after an id |

**External apps via Pipedream (6)**
| Tool | What it does |
|---|---|
| `connect_app` | Sign-in link for an app (gmail, slack, notion, ...) |
| `wait_for_app_connection` | Polls up to ~55 s until the user finished signing in |
| `list_connected_apps` | Apps the user has connected |
| `list_app_tools` | Actions an app offers (filterable, 40 max shown) |
| `get_app_tool` | JSON schema of one action |
| `run_app_tool` | Run an action as the user (checks connection first, returns link if missing) |

**Sandbox / computer use (11)**
`bash`, `readFile`, `writeFile`, `listFiles`, `mouseClick`, `mouseMove`, `mouseScroll`, `keyboardType`, `keyboardPress`, `viewScreen` (screenshot the bot sees), `showScreen` (screenshot shown to the user).

### 2.3 The 14 user-facing features

1. Sign up / sign in (Clerk)
2. "Connect your AI tool" home page with per-tool instructions (Claude Code, Codex, Cursor tabs) and an example prompt
3. First-run **connect dialog** that blocks the dashboard until your AI tool has connected once (`mcp_connections` table)
4. Create bots (name, job, instructions, DiceBear avatar) through MCP
5. One-on-one chat per bot (auto-created with the bot)
6. Group chats of multiple bots with mentions and hand-offs by message
7. Chat transcript page (read-only), with live refresh every 3 s
8. Sidebar: chat list, last-message preview, relative time, collapse to icons, active-chat highlight
9. Search dialog (Cmd/Ctrl+K) across chat names and previews
10. Live **desktop panel** (noVNC): preview thumbnail, click for fullscreen, reload, keep-alive heartbeat
11. Per-bot **sandbox** with idle auto-stop (5 min) and auto-restart on next use
12. Per-bot **memory file** (`~/MEMORY.md`) that the system prompt tells the bot to maintain
13. Act in Gmail/Slack/Notion/etc. through Pipedream with a one-time sign-in link
14. Error reporting with Sentry (web + Trigger.dev worker)

### 2.4 Database

| Table | Purpose |
|---|---|
| `bots` | name, job, instructions, avatar seed, `sandbox_id`, owner (`user_id`) |
| `chats` | `direct` or `group`, name, last message preview/time |
| `chat_members` | which bots are in which chat (composite PK, cascades) |
| `chat_messages` | transcript; `bot_id` null = written by the user; `mentions[]` |
| `mcp_connections` | one row per user once their AI tool has connected |

All reads/writes are scoped by the Clerk `userId`.

---

## 3. Problems found (and how to fix each)

Ordered by how likely they are to hurt you. "Confirmed" = visible directly in the code. "Likely" = follows from the code but I did not run it.

### P1. Group chat page is half-broken. **Confirmed**
- `app/(dashboard)/chats/[chatId]/page.tsx` always wraps the page in `VncProvider` and renders `ChatHeader` with `chat.bots[0]`.
- `actions/sandbox.ts` returns `"Group chats have no screen."` for groups, so every group chat shows an error in the desktop panel.
- `ChatHeader` shows only the first bot's name and avatar for a group, and `BotGuide` gets `bots[0].id`.

**Fix:** in the page, branch on `chat.kind`. For `group`: skip `VncProvider`/`ChatPanel`, and render a group header (group name + stacked avatars, `chat.name`, member list). Pass the group name/ids to a group-specific guide.

### P2. Sandbox tools can go stale after auto-stop. **Likely**
- `lib/sandbox-tools.ts` caches the started sandbox in `desktop ??= ...` and only clears it if the *start* fails.
- Daytona stops idle sandboxes after 5 min (`SANDBOX_AUTO_STOP_MINUTES`). `lib/mcp-sandbox.ts` also keeps the tools object forever in a module-level `Map`.
- After an auto-stop, mouse/keyboard/screenshot calls reuse the old object and can fail until the server instance restarts.

**Fix:** drop the memoisation, or on any computer-use error clear `desktop` and retry once. Re-run `getStartedSandbox` per call (it is cheap when already started).

### P3. No way to edit or delete a bot from the app. **Confirmed**
- `createBot`, `updateBot`, `deleteBot` in `actions/bot.ts` are not referenced by any component (the bot dialog was removed in commit `922bab4`).
- There is no `update_bot` / `delete_bot` MCP tool either. Sandboxes you no longer want keep existing in Daytona (cost).

**Fix:** either add MCP tools `update_bot` and `delete_bot` that call the same logic as `actions/bot.ts` (move that logic into `lib/` like `create-bot.ts`), or delete the unused actions. Prefer the MCP tools since that is the only interface now.

### P4. Duplicate bot names break group mentions. **Confirmed**
- `postGroupMessage` matches mentions by exact bot name, and `bots.name` has no uniqueness per user. Two bots named "Scout" in one group make the mention ambiguous.

**Fix:** reject duplicate names inside one group in `createGroupForUser`/`addBotToGroup`, or accept bot ids in `mentions`.

### P5. Every MCP request writes to the database. **Confirmed**
- `lib/mcp-auth.ts` calls `markConnected(userId)` on every authenticated request (insert ... on conflict do nothing).

**Fix:** only call it from `get_bot`/`list_bots`, or skip when the layout already knows the user is connected. Minor cost, easy win.

### P6. Aggressive polling. **Confirmed**
- `ChatLiveRefresh` runs `router.refresh()` every 3 s on the whole dashboard layout (sidebar + page). Each tick re-runs `getUserChats` plus the page queries.

**Fix:** raise to 5-10 s, or refresh only when the tab becomes visible and a task is in progress; longer term use SSE or a realtime channel.

### P7. In-memory sandbox cache does not work across serverless instances. **Likely**
- `toolsByBot` (Map) and `cachedToken` (Pipedream) live in module memory. On Vercel each instance has its own copy, so the "start the desktop once" optimisation is not guaranteed and the Map grows without eviction.

**Fix:** cap/evict the Map (LRU or TTL), and treat the cache as best-effort only.

### P8. Leftover / dead code and dependencies. **Confirmed**
- Trigger.dev chat agent was removed (commit `21bd740`). Only `trigger/example.ts` (hello-world) remains.
- `MISTRAL_API_KEY` is in `.env.local` but nothing reads it.
- `components/ai-elements/*` (about 50 files) and packages `@xyflow/react`, `recharts`, `@rive-app/react-webgl2`, `streamdown` and its plugins, `@ai-sdk/react`, `media-chrome`, `shiki` appear unused by the current app (the `ai` package is still used for `tool()` in `sandbox-tools.ts`).
- `tmp-create-bot.ts` is a scratch script in the repo root with a **hardcoded Clerk user id**.
- `README.md` is the untouched shadcn template, so there are no setup instructions (this report fills that gap).

**Fix:** delete `tmp-create-bot.ts`; remove the unused env var; run `bunx knip` (or grep imports) and remove unused components/packages; replace the README with sections 4-5 of this file.

### P9. Pipedream helper script uses a different user id. **Confirmed**
- `scripts/pipedream-headers.mjs` defaults `PIPEDREAM_EXTERNAL_USER_ID` to `"ai-teams-user"`. The app keys connections by the **Clerk user id**. Accounts connected through the script will not appear inside the app.

**Fix:** set `PIPEDREAM_EXTERNAL_USER_ID` to your Clerk user id when using the script, or stop using it and connect only through `connect_app`.

### P10. The Trigger.dev MCP server failed to connect in this session. **Confirmed**
- `.mcp.json` pins `trigger.dev@4.7.4` while the SDK/build are `4.8.1`, and the connection timed out after 30 s.

**Fix:** change the pin to `trigger.dev@4.8.1` (or `latest`) in `.mcp.json` and retry; it needs network and a first-time `npx` download.

### P11. Smaller things
| Item | Note | Fix |
|---|---|---|
| `maxDuration = 60` on `/api/mcp` | Starting a cold sandbox plus a desktop can approach this | Raise it if your Vercel plan allows, or return "starting, retry" |
| `readGroupMessages(after)` uses `createdAt >` | Two messages in the same millisecond can be skipped | Compare `(createdAt, id)` |
| `@types/node ^20` vs Trigger runtime `node-24` | Type mismatch risk | Bump `@types/node` |
| `public/build/image.png` is modified, uncommitted | Per project rules I did not touch git | Commit or discard as you prefer |
| No tests | Nothing guards the MCP tools | Add a few for `lib/groups.ts` and `lib/create-bot.ts` |
| Next.js 16 / React 19.3 | `AGENTS.md` says APIs differ from older Next | Read `node_modules/next/dist/docs/` before changing routing/caching |

---

## 4. Step-by-step: set up and run it

### Step 1: Prerequisites
- Node 20+ and **bun** (`bun.lock` is committed)
- Accounts: **Clerk**, **Neon**, **Daytona**, **Pipedream**; optional: **Sentry**, **Trigger.dev**, **Vercel**
- An MCP-capable AI tool: Claude Code, Codex or Cursor

### Step 2: Install
```bash
bun install
```

### Step 3: Create `.env.local`
Variable names come from your current `.env.local`; fill in the values from each dashboard.

| Variable | Needed? | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Required | Clerk dashboard, API keys |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` (`/sign-in`), `NEXT_PUBLIC_CLERK_SIGN_UP_URL` (`/sign-up`) | Required | Same pages as `app/sign-in`, `app/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`, `..._SIGN_UP_FALLBACK_REDIRECT_URL` (`/`) | Required | Where to land after sign-in |
| `DATABASE_URL` | Required | Neon connection string |
| `DAYTONA_API_KEY`, `DAYTONA_API_URL`, `DAYTONA_TARGET` | Required | Daytona dashboard |
| `PIPEDREAM_CLIENT_ID`, `PIPEDREAM_CLIENT_SECRET`, `PIPEDREAM_PROJECT_ID`, `PIPEDREAM_ENVIRONMENT` | Needed for app connections (Gmail, Slack...) | Pipedream Connect project (`development` or `production`) |
| `NEXT_PUBLIC_APP_URL` | Optional | Fallback public URL when there is no request context |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Optional | Sentry (token only for source maps) |
| `TRIGGER_SECRET_KEY` | Optional today | Trigger.dev; only the example task uses it |
| `MISTRAL_API_KEY` | Not used | Safe to remove (P8) |
| `VERCEL_OIDC_TOKEN` | Auto-set by `vercel env pull` | Not needed locally |

Never commit this file (`.env*` is git-ignored).

### Step 4: Enable OAuth for MCP in Clerk
MCP clients sign in through Clerk's OAuth (`verifyClerkToken` with `acceptsToken: "oauth_token"`; discovery routes live in `app/.well-known/`). In the Clerk dashboard, enable OAuth applications / dynamic client registration for your instance. *I did not verify the exact Clerk setting name, so check Clerk's current docs for "OAuth applications" if the sign-in from your AI tool fails.*

### Step 5: Push the database schema
This project uses **push only** (never generate or run migrations):
```bash
bun run db:push
```
Optional: `bun run db:studio` to browse the data.

### Step 6: Run
```bash
bun run dev
```
Open `http://localhost:3000`, sign up, and you will see the "Connect your AI tool" page.

### Step 7: Connect your AI tool
Use your app's URL in place of `http://localhost:3000` (the home page shows the exact commands).

- **Claude Code:**
  ```bash
  claude mcp add --transport http ai-teams http://localhost:3000/api/mcp
  ```
  Then in Claude Code run `/mcp`, choose `ai-teams`, **Authenticate**, and sign in with the same account in the browser.
- **Codex:**
  ```bash
  codex mcp add ai-teams --url http://localhost:3000/api/mcp
  codex mcp login ai-teams
  ```
- **Cursor:** add to `~/.cursor/mcp.json`:
  ```json
  { "mcpServers": { "ai-teams": { "url": "http://localhost:3000/api/mcp" } } }
  ```
  then Settings > MCP > Connect.

Note: a purely local `localhost` URL works for a local AI tool; for cloud-hosted tools you need a public URL (deploy, Step 10).

The first authenticated call creates your `mcp_connections` row and the dialog disappears.

### Step 8: Try it
Say to your AI tool:
> Using the ai-teams tools, create a bot named "Ada" with the job "Research assistant", then in its sandbox open Chromium and search for "code with antino".

Then open the chat link the tool returns. Click the desktop thumbnail to watch the bot work full screen.

### Step 9: Connect an app (optional)
Ask: "Using bot Ada, send me an email in Gmail." The tool returns a sign-in link; open it, then the AI tool continues automatically (`wait_for_app_connection`).

### Step 10: Deploy (Vercel)
1. `vercel link`, then add all env vars in the Vercel project.
2. Set `PIPEDREAM_ENVIRONMENT=production` if you use a production Pipedream project.
3. Deploy; point your AI tool at `https://<your-domain>/api/mcp`.
4. Optional Trigger.dev: `bunx trigger.dev@latest deploy` (project id is in `trigger.config.ts`).

### Step 11: Quality checks before you commit
```bash
bun run typecheck
bun run lint
bun run build
```
Run these first; I did not, so there may be errors I could not see.

---

## 5. Project rules to keep following (from `AGENTS.md`)

- **Git:** never branch/commit automatically; work on `main`; one requested action = one action.
- **Database:** only `bun run db:push`. No migrations, no `drizzle/` folder. This is a dev project: data is disposable, never backfill.
- **Forms:** react-hook-form + zod + `drizzle-zod` schema from `db/schema.ts`, server action in `actions/<entity>.ts` that re-validates, shadcn `Field` composition, toasts for every outcome, `useWatch` not `watch()`.
- **DiceBear 10:** `@dicebear/core` + `@dicebear/styles`; options end in `Variant`.
- **Next.js:** read `node_modules/next/dist/docs/` before changing framework-level code.
- **Trigger.dev:** load the matching skill before touching Trigger code.

---

## 6. Folder map

```
app/
  (dashboard)/layout.tsx        sidebar + connect gate + live refresh
  (dashboard)/page.tsx          "Connect your AI tool" home
  (dashboard)/chats/[chatId]/   chat transcript + desktop panel
  api/mcp/route.ts              the MCP server (27 tools)
  .well-known/                  OAuth discovery for MCP clients
  sign-in/, sign-up/            Clerk pages
actions/                        bot.ts, sandbox.ts, connection.ts (server actions)
components/                     app components + ui/ (shadcn) + ai-elements/ (mostly unused)
db/                             schema.ts, index.ts (Neon + Drizzle)
lib/                            create-bot, groups, daytona, sandbox-tools, mcp-*, bot-prompt
queries/                        bots.ts (sidebar), chats.ts (chat + messages)
trigger/                        Trigger.dev tasks (example only) + Sentry init
scripts/                        pipedream-headers.mjs
proxy.ts                        Clerk middleware
```

---

## 7. Suggested order to fix things

1. P1 group chat page (visible bug)
2. P2 stale sandbox after auto-stop (breaks bots mid-task)
3. P3 add `update_bot` / `delete_bot` MCP tools (stops sandbox cost leaks)
4. P8 cleanup: delete `tmp-create-bot.ts`, unused env var, unused packages, rewrite README
5. P4, P5, P6, P7, P9, P10, then the small items in P11

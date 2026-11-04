# Spike: filing requests from Discord with `/print`

**Question:** can members file a request from Discord, without opening the portal, in a
way a self-hosted society can run?

**Answer: yes, and cheaply.** A `/print` slash command now files a printing request,
using the portal's existing upload checks, costing and exec approval. It runs inside the
app, with no bot process, and works behind the same Cloudflare Tunnel or Caddy setup as
the website. It is off until an executive sets it up in **Settings › Discord** (or, on
older stacks, `ENABLE_DISCORD_BOT=true` in the env file).

## How it works

```
member types /print in Discord
  → Discord POSTs the command to https://<portal>/api/discord/interactions, signed
  → the portal checks the Ed25519 signature against the app's public key
  → it answers "thinking…" at once (Discord allows 3 seconds), visible only to the member
  → then, after the response (Next's after()): finds the member's portal account,
    downloads the attached file from Discord's CDN, checks it like any upload,
    and files the request (src/lib/printingServer.ts, shared with the web form)
  → replaces "thinking…" with the result and a link to the request
```

- **HTTP interactions, not a gateway bot.** Discord calls the portal; the portal never
  holds a connection open to Discord. That means no extra container and no process to
  keep alive, which matters for a society running this on a Pi. The cost is that
  Discord must be able to reach the portal: it works with a Cloudflare Tunnel or Caddy,
  and not in "just this computer" mode.
- **No new dependencies.** Signature checking is `node:crypto`; everything else is
  `fetch`. Code: `src/lib/discordBot.ts` and `src/app/api/discord/interactions/route.ts`.
- **The command registers itself.** On every start with the bot on, the app replaces the
  app's command list with `/print` (`registerCommands`), so a changed option reaches
  Discord with the next deploy and there's no registration script to run.
- **Options:** file (required), copies, pages per copy, pickup time (`YYYY-MM-DD HH:MM`),
  and optionally paper size, sides, colour and notes. Size, sides and colour are
  dropdowns, so they can't be mistyped.
- **Same rules as the website:** the file type allowlist and size limit
  (`src/lib/uploads.ts`), the Printing module must be on, the member must be active,
  and the request goes to the exec queue for approval like any other.

## Linking accounts

Discord tells the portal the member's Discord ID. To map it to a portal account, the
member opens their **Account** page, presses **Get a link code**, and runs `/link <code>`
in the society's server. The portal stores their Discord ID (`User.discordUserId`,
unique), and later commands match by it. A code works once, for 15 minutes, and only
its sha256 is stored.

A member who hasn't linked is still recognised if an executive put their Discord username
in the member import: the first command they run links them by that name. That match was
never confirmed by the member, so a typo, or a username someone else used to have, could
link the wrong account, and with `/claim` that's a claim filed in someone else's name. So
a username link is in the audit log, and the member gets a notification (emailed, if
notification emails are on) saying which Discord user was linked and to tell an executive
if it wasn't them. Members can't set their own Discord username: if that ever changes,
this match has to go, or anyone could take someone else's name.

## Setting it up (for the spike)

1. At [discord.com/developers/applications](https://discord.com/developers/applications),
   create an application. Copy its **Application ID** and **Public Key** (General
   Information), and reset and copy its **Bot token** (Bot). Turn off **Public Bot** so
   only you can add it to servers.
2. In the portal, **Settings › Discord › Print from Discord**: paste the Application
   ID, Public Key and Bot token, and your server's ID (enable Developer Mode in
   Discord, right-click the server, Copy Server ID), then Save. The bot stays off
   without the server ID, so the commands only ever work in your own server. Saving
   registers the commands with Discord and says so if Discord refuses the token. (The
   old env file settings, `ENABLE_DISCORD_BOT`, `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`,
   `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID`, still work; Settings wins over them.)
3. Back in the developer portal, set **Interactions Endpoint URL** to
   `https://<your portal>/api/discord/interactions` and save. Discord tests it straight
   away, and refuses to save it if the portal isn't answering correctly.
4. Add the app to your server: open
   `https://discord.com/oauth2/authorize?client_id=<Application ID>&scope=applications.commands`
   and pick the server. It needs no bot permissions: the command and its reply are all
   it uses.
5. Each member links their account once: Account page, **Get a link code**, then
   `/link <code>` in the server.

## What was tested

- Signature checking against Discord itself: Discord only saves an Interactions
  Endpoint URL after the endpoint answers its signed ping and refuses one with a bad
  signature, and it saved this one. Unsigned requests get 401. `npm run check:discord`
  covers a valid signature, a changed body, a changed timestamp, the wrong key and a
  malformed signature, and the pickup-time parsing.
- The command registered itself on start, with all eight options.
- End to end, on a production build behind a Cloudflare Tunnel, with a real member
  running `/print` in a test server: the app was added with only the
  `applications.commands` scope, the command appeared, and a PNG attachment came through
  as a printing request (25 copies, A4, single sided, black and white, costed at
  $2.50), awaiting approval, with the file saved through the upload checks, an audit
  entry and an exec notification. (That run linked the account by username, since
  replaced by `/link` codes.)

## Other request types

| Request | From Discord? | Why |
|---|---|---|
| Printing | **Yes** (this spike) | Short, structured, and the file is usually already in Discord |
| Treasury claims | **Yes** (`/claim`) | Receipts upload well from a phone. The command saves a draft, shows it with the society's rules, and files it on **Submit claim**; the first time, a Discord form asks for bank details (and an optional PayID) and saves them to the member's account. The category option only exists in budget mode |
| Event and content requests | No | Long free text (key points, notes) fits a form, not command options |
| Room bookings | No | Needs Arc's details and availability checks that the form walks through |
| **Exec approvals** | **Best next step** | Approve or reject buttons on the exec-queue posts that already go to Discord. Same endpoint, same signature check, and it saves execs the most clicks |

## Recommendation

Keep the endpoint and the signature check as they are. Accounts now link with `/link`
codes, so the next steps are:

1. Add approve and reject buttons to the exec-queue webhook posts, which would need the
   queue to post through the bot rather than a webhook, so the buttons can call back.
2. Consider letting the bot own the events forum: a bot can change a post's tags, which
   a webhook can't after the post is made, so each request's status could show as a
   forum tag.

It stays opt-in per society, and self-hosters who don't want it set nothing.

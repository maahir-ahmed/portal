import { NextRequest, NextResponse, after } from "next/server";
import { botSettings, freshInteraction, handleLink, handlePrint, replyToInteraction, verifyDiscordRequest, type DiscordMessage, type Interaction } from "@/lib/discordBot";
import { claimCategories, handleClaim, handleClaimBank, handleClaimButton } from "@/lib/discordClaim";

// Discord's interactions endpoint for the /print spike (src/lib/discordBot.ts). Public,
// like /api/auth: Discord's signature is the authentication. Set this URL as the app's
// Interactions Endpoint URL in the Discord developer portal.

const PING = 1;
const COMMAND = 2;
const BUTTON = 3;
const AUTOCOMPLETE = 4;
const FORM = 5;

export async function POST(req: NextRequest) {
  const bot = await botSettings();
  if (!bot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const publicKey = bot.publicKey;

  const body = await req.text();
  const ok = verifyDiscordRequest(body, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"), publicKey);
  // Discord checks the endpoint refuses bad signatures before it will save the URL.
  // A good signature on an old timestamp is a replay.
  if (!ok || !freshInteraction(req.headers.get("x-signature-timestamp"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  const i = JSON.parse(body) as Interaction;
  // Only commands for this server, whichever kind of interaction: /claim's buttons and
  // form come from the same server as the command.
  if (i.type !== PING && i.guild_id !== bot.guildId) {
    return NextResponse.json({ type: 4, data: { content: "Use this in your society's server.", flags: 64 } });
  }
  if (i.type === PING) return NextResponse.json({ type: 1 });
  if (i.type === COMMAND && i.data.name === "link") {
    return NextResponse.json({ type: 4, data: { content: await handleLink(i, bot), flags: 64 } });
  }
  if (i.type === BUTTON && i.data.custom_id?.startsWith("claim:")) return NextResponse.json(await handleClaimButton(i));
  if (i.type === FORM && i.data.custom_id?.startsWith("claim:bank:")) return NextResponse.json(await handleClaimBank(i));
  if (i.type === AUTOCOMPLETE && i.data.name === "claim") return NextResponse.json(await claimCategories(i));

  const run: Record<string, (i: Interaction) => Promise<string | DiscordMessage>> = {
    print: (i) => handlePrint(i, bot),
    claim: handleClaim,
  };
  const handler = i.type === COMMAND ? run[i.data.name] : undefined;
  if (!handler) return NextResponse.json({ type: 4, data: { content: "I don't know that command.", flags: 64 } });

  // Discord wants an answer within 3 seconds, and downloading the file can take longer,
  // so say "thinking" now (only the sender sees it: flag 64) and fill it in afterwards.
  after(async () => {
    let reply: string | DiscordMessage;
    try {
      reply = await handler(i);
    } catch (err) {
      console.error(`/${i.data.name} failed:`, err);
      reply = "Something went wrong filing that. Try the website instead.";
    }
    await replyToInteraction(i, reply);
  });
  return NextResponse.json({ type: 5, data: { flags: 64 } });
}

import { NextRequest, NextResponse, after } from "next/server";
import { botEnabled, freshInteraction, handleLink, handlePrint, replyToInteraction, verifyDiscordRequest, type Interaction } from "@/lib/discordBot";

// Discord's interactions endpoint for the /print spike (src/lib/discordBot.ts). Public,
// like /api/auth: Discord's signature is the authentication. Set this URL as the app's
// Interactions Endpoint URL in the Discord developer portal.

const PING = 1;
const COMMAND = 2;

export async function POST(req: NextRequest) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!botEnabled() || !publicKey) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.text();
  const ok = verifyDiscordRequest(body, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"), publicKey);
  // Discord checks the endpoint refuses bad signatures before it will save the URL.
  // A good signature on an old timestamp is a replay.
  if (!ok || !freshInteraction(req.headers.get("x-signature-timestamp"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  const i = JSON.parse(body) as Interaction & { type: number };
  if (i.type === PING) return NextResponse.json({ type: 1 });
  if (i.type === COMMAND && i.data.name === "link") {
    return NextResponse.json({ type: 4, data: { content: await handleLink(i), flags: 64 } });
  }
  if (i.type !== COMMAND || i.data.name !== "print") {
    return NextResponse.json({ type: 4, data: { content: "I don't know that command.", flags: 64 } });
  }

  // Discord wants an answer within 3 seconds, and downloading the file can take longer,
  // so say "thinking" now (only the sender sees it: flag 64) and fill it in afterwards.
  after(async () => {
    let reply: string;
    try {
      reply = await handlePrint(i);
    } catch (err) {
      console.error("/print failed:", err);
      reply = "Something went wrong filing that. Try the website instead.";
    }
    await replyToInteraction(i, reply);
  });
  return NextResponse.json({ type: 5, data: { flags: 64 } });
}

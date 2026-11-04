import { prisma } from "./db";
import { decryptSecret } from "./secrets";

// Server settings an executive can set in the app (Settings > Email, Settings > Discord)
// instead of in the server's env file, so a society needs nobody at a command line for
// them. The app's value wins; a null column falls back to the env file, which is how the
// hosted stacks and older self-hosted ones are set up. One society per deployment, so
// the settings are that society's row (SOCIETY_SLUG, or the first society).

async function settingsRow() {
  const slug = process.env.SOCIETY_SLUG;
  try {
    return await prisma.society.findFirst({
      where: slug ? { slug } : {},
      orderBy: { createdAt: "asc" },
      select: {
        smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, emailFrom: true,
        discordBotEnabled: true, discordAppId: true, discordPublicKey: true, discordBotToken: true, discordGuildId: true,
      },
    });
  } catch {
    return null; // no database at build time
  }
}

const reveal = (stored: string | null) => {
  if (!stored) return "";
  try {
    return decryptSecret(stored);
  } catch {
    return null; // stored under a key this server no longer has
  }
};

export type Source = "app" | "server";
export type Smtp = { host: string; port: number; user: string; pass: string; from: string; source: Source };

/** How to send email, or null when it is off. */
export async function emailSettings(): Promise<Smtp | null> {
  const s = await settingsRow();
  if (s && s.smtpHost !== null) {
    const pass = reveal(s.smtpPass);
    if (!s.smtpHost || pass === null) return null; // "" is switched off in the app
    return { host: s.smtpHost, port: s.smtpPort ?? 587, user: s.smtpUser ?? "", pass, from: s.emailFrom ?? "", source: "app" };
  }
  const e = process.env;
  if (!e.SMTP_HOST) return null;
  return {
    host: e.SMTP_HOST,
    port: Number(e.SMTP_PORT ?? 587),
    user: e.SMTP_USER ?? "",
    pass: e.SMTP_PASS ?? "",
    from: e.EMAIL_FROM ?? "noreply@society.local",
    source: "server",
  };
}

export type Bot = { appId: string; publicKey: string; token: string; guildId: string; source: Source };

/** The Discord bot's credentials, or null when the bot is off or not fully set up. */
export async function botSettings(): Promise<Bot | null> {
  const s = await settingsRow();
  if (s && s.discordBotEnabled !== null) {
    const token = reveal(s.discordBotToken);
    if (!s.discordBotEnabled || !s.discordAppId || !s.discordPublicKey || !token || !s.discordGuildId) return null;
    return { appId: s.discordAppId, publicKey: s.discordPublicKey, token, guildId: s.discordGuildId, source: "app" };
  }
  const e = process.env;
  if (e.ENABLE_DISCORD_BOT !== "true" || !e.DISCORD_APP_ID || !e.DISCORD_PUBLIC_KEY || !e.DISCORD_BOT_TOKEN || !e.DISCORD_GUILD_ID) {
    return null;
  }
  return { appId: e.DISCORD_APP_ID, publicKey: e.DISCORD_PUBLIC_KEY, token: e.DISCORD_BOT_TOKEN, guildId: e.DISCORD_GUILD_ID, source: "server" };
}

/** Whether a society's deadline reminders are on: its own switch, else the env file's. */
export const remindersDefault = () => process.env.DISCORD_REMINDERS === "on";

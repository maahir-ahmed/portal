// Runs once when the server starts (Next's instrumentation hook). Starts the Discord
// deadline reminders (src/lib/reminders.ts), and registers the /print command if the
// bot is set up (Settings > Discord, or the env file). Production only: a dev server pointed at a copy of a
// real database would otherwise ping the real society's Discord.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  // Always ticking: each society's own switch (Settings > Discord, else DISCORD_REMINDERS)
  // decides whether its requests get reminders, and can change without a restart.
  const { startReminders } = await import("./lib/reminders");
  startReminders();
  const { botSettings, registerCommands } = await import("./lib/discordBot");
  // Not awaited: Discord being slow mustn't hold up the start.
  void botSettings().then(async (bot) => {
    const failed = bot && (await registerCommands(bot));
    if (failed) console.warn(`Discord bot: ${failed}`);
  });
}

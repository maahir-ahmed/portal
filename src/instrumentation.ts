// Runs once when the server starts (Next's instrumentation hook). Starts the Discord
// deadline reminders (src/lib/reminders.ts). Production only: a dev server pointed at
// a copy of a real database would otherwise ping the real society's Discord.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  if (process.env.DISCORD_REMINDERS === "off") return;
  const { startReminders } = await import("./lib/reminders");
  startReminders();
}

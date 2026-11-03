// The Settings > Debugging tab reads, backs up, restores and runs raw SQL against the
// whole database. It exists only when the stack opts in, and never on the public demo,
// where every visitor is signed in as an executive.
export function debugToolsEnabled(): boolean {
  return process.env.ENABLE_DEBUG_TOOLS === "true" && process.env.DEMO_MODE !== "1";
}

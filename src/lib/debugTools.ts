// Settings > Backups (export and import a whole-portal archive) exists on any
// single-society stack (SOCIETY_SLUG) except the public demo, where every visitor is
// signed in as an executive. With several societies on one stack, one society's
// executive would hold all of them.
export function backupsEnabled(): boolean {
  return process.env.DEMO_MODE !== "1" && !!process.env.SOCIETY_SLUG;
}

// The Settings > Debugging tab reads and runs raw SQL against the whole database, so
// on top of that it exists only when the stack opts in.
export function debugToolsEnabled(): boolean {
  return process.env.ENABLE_DEBUG_TOOLS === "true" && backupsEnabled();
}

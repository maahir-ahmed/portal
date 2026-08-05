// The portfolio executives are assigned to. Matched by name in a few places (the
// invite dialog preselects it, the members page sorts it first, the API refuses to
// rename or delete it), so it lives here rather than being typed out each time.
export const EXEC_PORTFOLIO = "Executive";

// What a fresh society starts with, and what the "add the usual portfolios" button
// in Settings creates.
export const DEFAULT_PORTFOLIOS = [EXEC_PORTFOLIO, "Marketing", "Technical", "Events"];

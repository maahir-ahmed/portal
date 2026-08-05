// Portfolios are the areas the committee is split into. Every portfolio has a
// director title and a subcommittee title, and a member's portfolio is derived from
// their title rather than picked separately: assigning "Creative Subcom" puts them
// in Creatives. Executives are grouped by role instead and hold no portfolio.
//
// Title names are not always the portfolio name (Creatives -> "Creative Director"),
// so each one carries its own prefix.
export interface BasePortfolio {
  name: string;
  titlePrefix: string;
}

export const BASE_PORTFOLIOS: BasePortfolio[] = [
  { name: "Careers", titlePrefix: "Careers" },
  { name: "Conferences", titlePrefix: "Conferences" },
  { name: "Creatives", titlePrefix: "Creative" },
  { name: "CTF", titlePrefix: "CTF" },
  { name: "Education", titlePrefix: "Education" },
  { name: "Marketing", titlePrefix: "Marketing" },
  { name: "Projects", titlePrefix: "Projects" },
  { name: "Socials", titlePrefix: "Socials" },
  { name: "Media", titlePrefix: "Media" },
];

// Executive titles belong to no portfolio.
export const EXEC_TITLES = [
  "President",
  "Vice President",
  "Secretary",
  "Treasurer",
  "Arc Delegate",
  "Welfare Officer",
];

export const directorTitle = (p: BasePortfolio) => `${p.titlePrefix} Director`;
export const subcomTitle = (p: BasePortfolio) => `${p.titlePrefix} Subcom`;

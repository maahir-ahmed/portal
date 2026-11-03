import type { Role } from "@prisma/client";
import { csvLine } from "./csv";

// Bulk member import (Settings > Import members, and the setup wizard). The preview and
// the commit both run checkImport over the same file, so what the preview shows is
// what gets written. Nobody is emailed or given a password: imported members start
// NOT_INVITED and an executive issues each a passphrase (see SocietyMembership).

export const IMPORT_COLUMNS = ["name", "email", "role", "title", "portfolios", "student_id", "discord_username"] as const;
const REQUIRED = ["name", "email", "role"] as const;

export const IMPORT_TEMPLATE =
  [
    csvLine([...IMPORT_COLUMNS]),
    csvLine(["Jane Citizen", "jane@example.com", "Director", "Events Director", "Events;Marketing", "z1234567", "janec"]),
  ].join("\r\n") + "\r\n";

const ROLES: Record<string, Role> = { executive: "EXECUTIVE", director: "DIRECTOR", subcommittee: "SUBCOMMITTEE" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ImportRow = {
  line: number;
  name: string;
  email: string;
  role: Role | null;
  title: string | null;
  portfolios: string[];
  studentId: string | null;
  discordUsername: string | null;
  status: "add" | "skip" | "error";
  problems: string[];
};

export type ImportContext = {
  /** Emails (lowercase) of this society's active members. */
  members: Set<string>;
  /** Titles by lowercase name. */
  titles: Map<string, { name: string; roleLevel: Role; portfolioId: string | null }>;
  /** Portfolios by lowercase name. */
  portfolios: Map<string, { id: string; name: string }>;
};

export type ImportCheck = {
  error?: string;
  rows: ImportRow[];
  /** Portfolio names the file uses that don't exist yet; the import creates them. */
  newPortfolios: string[];
};

export function checkImport(table: string[][], ctx: ImportContext): ImportCheck {
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) {
    return {
      error: `The first row must be the column names. Missing: ${missing.join(", ")}. Start from the template.`,
      rows: [],
      newPortfolios: [],
    };
  }
  const col = (cells: string[], name: string) => (cells[header.indexOf(name)] ?? "").trim();

  const seen = new Set<string>();
  const newPortfolios = new Map<string, string>();
  const rows: ImportRow[] = [];

  table.slice(1).forEach((cells, i) => {
    if (cells.every((c) => !c.trim())) return; // blank line
    const problems: string[] = [];
    const name = col(cells, "name");
    const email = col(cells, "email").toLowerCase();
    const roleText = col(cells, "role");
    const role = ROLES[roleText.toLowerCase()] ?? null;
    const titleText = col(cells, "title");
    const portfolios = [...new Set(col(cells, "portfolios").split(";").map((p) => p.trim()).filter(Boolean))];

    if (!name) problems.push("Name is empty");
    if (!email) problems.push("Email is empty");
    else if (!EMAIL.test(email)) problems.push(`"${email}" isn't an email address`);
    else if (seen.has(email)) problems.push("This email is already further up the file");
    if (!role) problems.push(roleText ? `Role "${roleText}" must be Executive, Director or Subcommittee` : "Role is empty");

    let title: string | null = null;
    if (titleText) {
      const t = ctx.titles.get(titleText.toLowerCase());
      if (!t) problems.push(`No title called "${titleText}". Add it in Settings first, or leave it blank.`);
      else if (role && t.roleLevel !== role) problems.push(`"${t.name}" is a title for ${t.roleLevel.toLowerCase()}s`);
      else title = t.name;
    }
    for (const p of portfolios) {
      if (!ctx.portfolios.has(p.toLowerCase())) newPortfolios.set(p.toLowerCase(), p);
    }

    if (email) seen.add(email);
    const already = !problems.length && ctx.members.has(email);
    rows.push({
      line: i + 2,
      name,
      email,
      role,
      title,
      // Spelled as the existing portfolio is, so the commit can look them up.
      portfolios: portfolios.map((p) => ctx.portfolios.get(p.toLowerCase())?.name ?? newPortfolios.get(p.toLowerCase())!),
      studentId: col(cells, "student_id") || null,
      discordUsername: col(cells, "discord_username") || null,
      status: problems.length ? "error" : already ? "skip" : "add",
      problems: already ? ["Already a member, left as they are"] : problems,
    });
  });

  if (!rows.length) return { error: "The file has no members in it, only the column names.", rows, newPortfolios: [] };
  // Only portfolios a row that will actually be imported uses.
  const used = new Set(rows.filter((r) => r.status === "add").flatMap((r) => r.portfolios.map((p) => p.toLowerCase())));
  return { rows, newPortfolios: [...newPortfolios].filter(([k]) => used.has(k)).map(([, v]) => v) };
}

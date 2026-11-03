import type { PrintingStatus, SecretarialTier } from "@prisma/client";

// Statuses that count against the secretarial allowance (approved and beyond).
export const PRINTING_COUNTS_TOWARD_BUDGET: PrintingStatus[] = [
  "PENDING_ARC_SUBMISSION",
  "SUBMITTED",
  "READY_FOR_PICKUP",
];

// Per-page printing rates (AUD). "double" applies to either double-sided flip option.
export const PRINT_RATES = {
  A4: { single: { BW: 0.1, COLOUR: 0.5 }, double: { BW: 0.2, COLOUR: 0.9 } },
  A3: { single: { BW: 0.2, COLOUR: 1.0 }, double: { BW: 0.35, COLOUR: 1.75 } },
} as const;

export const SECRETARIAL_ALLOWANCE: Record<SecretarialTier, number> = {
  BRONZE: 150,
  SILVER: 225,
  GOLD: 405,
};

// Arc's club tiers by active Arc members: 5-74 Bronze, 75-249 Silver, 250+ Gold
// (arc.unsw.edu.au/clubs/club-forms/grants). Under 5 can't affiliate; Bronze anyway.
export function tierForMembers(count: number): SecretarialTier {
  return count >= 250 ? "GOLD" : count >= 75 ? "SILVER" : "BRONZE";
}

export type PaperSize = "A4" | "A3";
export type Sided = "SINGLE" | "DOUBLE_SHORT" | "DOUBLE_LONG";
export type Colour = "BW" | "COLOUR";

export const SIDED_LABELS: Record<Sided, string> = {
  SINGLE: "Single sided",
  DOUBLE_SHORT: "Double sided, flip on short edge",
  DOUBLE_LONG: "Double sided, flip on long edge",
};

export function perPageRate(size: PaperSize, sided: Sided, colour: Colour): number {
  const dim = sided === "SINGLE" ? "single" : "double";
  return PRINT_RATES[size][dim][colour];
}

// Total cost = per-page rate × pages per copy × number of copies.
export function computePrintingCost(input: {
  paperSize: PaperSize;
  sided: Sided;
  colour: Colour;
  pages: number;
  quantity: number;
}): number {
  const rate = perPageRate(input.paperSize, input.sided, input.colour);
  const cost = rate * input.pages * input.quantity;
  return Math.round(cost * 100) / 100;
}

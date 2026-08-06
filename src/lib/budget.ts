// Convert a Prisma BudgetCategory (Decimal fields) into a plain JSON-safe object.
// Kept here so every route/page serialises categories the same way.
type DecimalLike = { toString(): string } | number | null;
const num = (v: DecimalLike) => (v == null ? null : Number(v));

export function serialiseCategory<T extends {
  yearlyBudget: DecimalLike; budget2024: DecimalLike; budget2024v2: DecimalLike;
  budget2025: DecimalLike; usage2025: DecimalLike; worstCase: DecimalLike;
}>(c: T) {
  return {
    ...c,
    yearlyBudget: num(c.yearlyBudget) ?? 0,
    budget2024: num(c.budget2024),
    budget2024v2: num(c.budget2024v2),
    budget2025: num(c.budget2025),
    usage2025: num(c.usage2025),
    worstCase: num(c.worstCase),
  };
}

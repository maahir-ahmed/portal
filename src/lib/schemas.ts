import { z } from "zod";
import { isPlausibleDate } from "@/lib/utils";
import { TUTORIAL_MARKER } from "@/lib/tutorial";

/** A link to another site: http(s) only, so it can't be javascript: or data: in an href or QR code. */
export const httpUrl = z
  .string()
  .max(2000)
  .refine((s) => /^https?:\/\/[^\s]+$/i.test(s), "Enter a link starting with http:// or https://");

/** Any date or date-time the app can lay out (2000 to 2100): garbage is a 400, not a Prisma 500. */
export const plausibleDate = z.string().refine(isPlausibleDate, "Enter a real date");
/** Same, for fields the server turns into a date by appending `T00:00:00Z`. */
export const plainDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a real date").refine(isPlausibleDate, "Enter a real date");
/** A date input that may be left empty. */
export const optionalDate = (d: z.ZodType<string>) => z.union([z.literal(""), d]).nullable().optional();

/** The largest amount a Decimal(10,2) column holds; past it Postgres answers with a 500. */
export const MAX_MONEY = 99_999_999.99;
/** Dollars: not negative, within the column, rounded to cents so every check sees the stored value. */
export const money = z.number().finite().min(0).max(MAX_MONEY).transform((n) => Math.round(n * 100) / 100);
/** A time of day as the booking form's time select sends it. */
export const time24 = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time like 14:30");

/**
 * Refuses text that starts with the guided tour's marker. Demo records are told apart
 * from real ones by that prefix alone, so a real record carrying it would be hidden
 * from the executives' queue and the printing allowance.
 */
export const notDemo = (s: z.ZodString) =>
  s.refine((v) => !v.startsWith(TUTORIAL_MARKER), `Names can't start with ${TUTORIAL_MARKER}`);

import { z } from "zod";
import { isPlausibleDate } from "@/lib/utils";

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

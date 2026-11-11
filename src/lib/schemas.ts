import { z } from "zod";

/** A link to another site: http(s) only, so it can't be javascript: or data: in an href or QR code. */
export const httpUrl = z
  .string()
  .max(2000)
  .refine((s) => /^https?:\/\/[^\s]+$/i.test(s), "Enter a link starting with http:// or https://");

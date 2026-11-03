import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

// What may be uploaded, shared by the upload route and the Discord /print command.
export const MAX_UPLOAD = Number(process.env.MAX_FILE_SIZE_MB ?? 10) * 1024 * 1024;
export const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
// The saved extension decides the Content-Type at serve time, and both the
// filename and file.type are attacker-controlled, so whitelist the extension
// too (no svg/html: they execute script when rendered same-origin).
export const ALLOWED_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx"];

export const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/** Saves a checked file under a random name and returns its /uploads URL. */
export async function saveUpload(bytes: Buffer, ext: string): Promise<string> {
  const filename = `${randomUUID()}.${ext}`;
  const uploadDir = join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, filename), bytes);
  return `/uploads/${filename}`;
}

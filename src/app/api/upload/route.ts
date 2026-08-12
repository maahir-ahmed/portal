import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const MAX_SIZE = Number(process.env.MAX_FILE_SIZE_MB ?? 10) * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
// The saved extension decides the Content-Type at serve time, and both the
// filename and file.type are attacker-controlled, so whitelist the extension
// too (no svg/html: they execute script when rendered same-origin).
const ALLOWED_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx"];

// A caller can narrow the allowlist for its own field by posting an `accept` value.
// AHEGS minutes are PDF-only because they get merged into one document for Arc, and
// there is no converter on the box — Word and Docs both export PDF in one step.
const NARROWED: Record<string, { types: string[]; exts: string[]; hint: string }> = {
  pdf: {
    types: ["application/pdf"],
    exts: ["pdf"],
    hint: "Minutes must be a PDF. In Word use File → Save As → PDF; in Google Docs, File → Download → PDF.",
  },
};

export async function POST(req: NextRequest) {
  const { error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large" }, { status: 400 });

  const narrow = NARROWED[String(formData.get("accept") ?? "")];
  const allowedTypes = narrow?.types ?? ALLOWED_TYPES;
  const allowedExts = narrow?.exts ?? ALLOWED_EXTS;
  const refuse = narrow?.hint ?? "File type not allowed";

  if (!allowedTypes.includes(file.type)) return NextResponse.json({ error: refuse }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExts.includes(ext)) return NextResponse.json({ error: refuse }, { status: 400 });
  const filename = `${randomUUID()}.${ext}`;
  const uploadDir = join(process.cwd(), "uploads");

  await mkdir(uploadDir, { recursive: true });
  const bytes = await file.arrayBuffer();
  await writeFile(join(uploadDir, filename), Buffer.from(bytes));

  return NextResponse.json({
    url: `/uploads/${filename}`,
    name: file.name,
  });
}

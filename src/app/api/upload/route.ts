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

export async function POST(req: NextRequest) {
  const { error: authErr } = await requireAuth();
  if (authErr) return authErr;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "File type not allowed" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTS.includes(ext)) return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
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

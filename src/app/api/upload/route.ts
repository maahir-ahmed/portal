import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireActiveMember } from "@/lib/api";
import { ALLOWED_EXTS, ALLOWED_TYPES, MAX_UPLOAD, extOf, saveUpload } from "@/lib/uploads";

// A caller can narrow the allowlist for its own field by posting an `accept` value.
// AHEGS minutes are PDF-only because they get merged into one document for Arc, and
// there is no converter on the box — Word and Docs both export PDF in one step.
const NARROWED: Record<string, { types: string[]; exts: string[]; hint: string }> = {
  pdf: {
    types: ["application/pdf"],
    exts: ["pdf"],
    hint: "This has to be a PDF so it can be merged into one document. In Word use File → Save As → PDF; in Google Docs, File → Download → PDF.",
  },
  // Event activity photos: refused here rather than after the file is already on disk.
  image: {
    types: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    exts: ["jpg", "jpeg", "png", "gif", "webp"],
    hint: "This has to be a photo: JPG, PNG, GIF or WebP.",
  },
};

export async function POST(req: NextRequest) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const notMember = await requireActiveMember(session!.user.id);
  if (notMember) return notMember;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_UPLOAD) return NextResponse.json({ error: "File too large" }, { status: 400 });

  const narrow = NARROWED[String(formData.get("accept") ?? "")];
  const allowedTypes = narrow?.types ?? ALLOWED_TYPES;
  const allowedExts = narrow?.exts ?? ALLOWED_EXTS;
  const refuse = narrow?.hint ?? "File type not allowed";

  if (!allowedTypes.includes(file.type)) return NextResponse.json({ error: refuse }, { status: 400 });

  const ext = extOf(file.name);
  if (!allowedExts.includes(ext)) return NextResponse.json({ error: refuse }, { status: 400 });
  const url = await saveUpload(Buffer.from(await file.arrayBuffer()), ext);

  return NextResponse.json({
    url,
    name: file.name,
  });
}

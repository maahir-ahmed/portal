import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { join, normalize } from "path";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/db";

// Uploaded files live in process.cwd()/uploads (a mounted volume in prod).
// Next only serves /public statically, so this handler serves /uploads/* itself.
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  // no svg: it executes script when rendered same-origin
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  // Join + normalise, then reject any traversal outside the uploads dir.
  const safe = normalize(path.join("/")).replace(/^(\.\.(\/|\\|$))+/, "");
  if (safe.includes("..") || safe.startsWith("/")) {
    return new Response("Not found", { status: 404 });
  }

  // Uploaded files (invoices, receipts, docs) require a logged-in user; same-origin
  // <img>/<a> requests carry the session cookie automatically. The one exception is a
  // society's current logo, which the login page shows before anyone has signed in.
  const { error } = await requireAuth();
  if (error) {
    const isLogo = await prisma.society.findFirst({ where: { logoUrl: `/uploads/${safe}` }, select: { id: true } });
    if (!isLogo) return error;
  }

  try {
    const data = await readFile(join(process.cwd(), "uploads", safe));
    const ext = safe.split(".").pop()?.toLowerCase() ?? "";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
        // Uploads are user-supplied: never let the browser sniff a scriptable
        // type or run anything embedded in them (defence in depth vs stored XSS).
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

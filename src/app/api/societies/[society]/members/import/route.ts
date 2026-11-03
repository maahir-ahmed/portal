import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireAuth, requireMembership } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { checkImport, type ImportContext } from "@/lib/memberImport";
import { readTable } from "@/lib/xlsx";

const MAX_BYTES = 2 * 1024 * 1024;

// POST the file itself as the body. ?dryRun=1 only checks it and returns the preview;
// without it the same check runs again and, if no row has a problem, every new member
// is written in one transaction: all of them or none.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ society: string }> },
) {
  const { session, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { society } = await params;
  const { membership, error } = await requireMembership(
    session!.user.id,
    society,
    "EXECUTIVE",
  );
  if (error) return error;
  const societyId = membership!.societyId;

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length)
    return NextResponse.json({ error: "The file is empty" }, { status: 400 });
  if (buf.length > MAX_BYTES)
    return NextResponse.json({ error: "Files up to 2 MB" }, { status: 413 });

  let table: string[][];
  try {
    table = readTable(buf);
  } catch {
    return NextResponse.json(
      {
        error:
          "Couldn't read that file. Save it as .csv or .xlsx and try again.",
      },
      { status: 400 },
    );
  }

  const [members, titles, portfolios] = await Promise.all([
    prisma.societyMembership.findMany({
      where: { societyId, isActive: true },
      select: { user: { select: { email: true } } },
    }),
    prisma.societyTitle.findMany({
      where: { societyId },
      select: { name: true, roleLevel: true, portfolioId: true },
    }),
    prisma.portfolio.findMany({
      where: { societyId },
      select: { id: true, name: true },
    }),
  ]);
  const ctx: ImportContext = {
    members: new Set(members.map((m) => m.user.email.toLowerCase())),
    titles: new Map(titles.map((t) => [t.name.toLowerCase(), t])),
    portfolios: new Map(portfolios.map((p) => [p.name.toLowerCase(), p])),
  };
  const check = checkImport(table, ctx);
  if (check.error) return NextResponse.json(check, { status: 400 });
  if (req.nextUrl.searchParams.get("dryRun") === "1")
    return NextResponse.json(check);

  if (check.rows.some((r) => r.status === "error")) {
    return NextResponse.json(
      { ...check, error: "Fix the rows with problems first" },
      { status: 400 },
    );
  }
  const toAdd = check.rows.filter((r) => r.status === "add");
  if (!toAdd.length)
    return NextResponse.json(
      { ...check, error: "Everyone in this file is already a member" },
      { status: 400 },
    );

  try {
    await prisma.$transaction(
      async (tx) => {
        const portfolioIds = new Map(portfolios.map((p) => [p.name, p.id]));
        const top = await tx.portfolio.aggregate({
          where: { societyId },
          _max: { sortOrder: true },
        });
        let order = top._max.sortOrder ?? 0;
        for (const name of check.newPortfolios) {
          const p = await tx.portfolio.create({
            data: { societyId, name, sortOrder: ++order },
          });
          portfolioIds.set(name, p.id);
        }

        for (const row of toAdd) {
          const role = row.role!;
          // Executives hold no portfolio of their own; everyone else gets their title's.
          const portfolioId =
            role === "EXECUTIVE"
              ? null
              : (row.title &&
                  ctx.titles.get(row.title.toLowerCase())?.portfolioId) ||
                null;
          const extras = row.portfolios
            .map((p) => portfolioIds.get(p)!)
            .filter((id) => id !== portfolioId);

          // Someone already in the database (a removed member, say) keeps their account
          // and password; only a new account starts with no way to sign in.
          const user =
            (await tx.user.findUnique({
              where: { email: row.email },
              select: { id: true, passwordHash: true },
            })) ??
            (await tx.user.create({
              data: {
                email: row.email,
                name: row.name,
                zId: row.studentId,
                discordUsername: row.discordUsername,
              },
              select: { id: true, passwordHash: true },
            }));
          const data = {
            role,
            title: row.title,
            portfolioId,
            isActive: true,
            inviteStatus: user.passwordHash
              ? ("ACTIVE" as const)
              : ("NOT_INVITED" as const),
          };
          const m = await tx.societyMembership.upsert({
            where: { userId_societyId: { userId: user.id, societyId } },
            update: data,
            create: { ...data, userId: user.id, societyId },
            select: { id: true },
          });
          await tx.memberPortfolio.deleteMany({
            where: { membershipId: m.id },
          });
          if (extras.length) {
            await tx.memberPortfolio.createMany({
              data: extras.map((portfolioId) => ({
                membershipId: m.id,
                portfolioId,
              })),
            });
          }
        }
      },
      { timeout: 60_000 },
    );
  } catch (err) {
    console.error("[members/import] rolled back:", err);
    return NextResponse.json(
      { ...check, error: "The import failed, so nobody was added. Try again." },
      { status: 500 },
    );
  }

  const fileName = (req.nextUrl.searchParams.get("name") ?? "").slice(0, 200);
  await createAuditLog({
    societyId,
    userId: session!.user.id,
    action: "CREATE",
    entityType: "MemberImport",
    entityId: societyId,
    metadata: {
      file: fileName,
      sha256: createHash("sha256").update(buf).digest("hex"),
      added: toAdd.length,
      skipped: check.rows.length - toAdd.length,
      portfoliosCreated: check.newPortfolios.join(", "),
    },
  });
  return NextResponse.json({ ...check, added: toAdd.length });
}

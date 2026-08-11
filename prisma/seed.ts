import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { BASE_PORTFOLIOS, EXEC_TITLES, directorTitle, subcomTitle } from "../src/lib/portfolios";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // Create demo society: UNSW Security Society
  const society = await prisma.society.upsert({
    where: { slug: "secsoc" },
    update: {},
    create: {
      name: "UNSW Security Society",
      slug: "secsoc",
      description: "The premier cybersecurity and information security society at UNSW Sydney.",
      logoUrl: "/secsoc-logo.png",
      primaryColor: "#00ffd1",
      secondaryColor: "#007869",
      contactEmail: "contact@example.com",
    },
  });

  // The nine committee portfolios, in committee order.
  const portfolios = await Promise.all(
    BASE_PORTFOLIOS.map((p, i) =>
      prisma.portfolio.upsert({
        where: { societyId_name: { societyId: society.id, name: p.name } },
        update: { sortOrder: i + 1 },
        create: { societyId: society.id, name: p.name, sortOrder: i + 1 },
      })
    )
  );
  const portfolioByName = new Map(portfolios.map((p) => [p.name, p]));

  // Create demo users. Emails are example.com (RFC 2606) so a demo database can
  // never mail a real person. DEMO_PASSWORD lets the public demo stack set its own.
  const demoPassword = process.env.DEMO_PASSWORD || "password123";
  const password = await bcrypt.hash(demoPassword, 12);

  const [demo, alice, bob, charlie] = await Promise.all([
    prisma.user.upsert({
      where: { email: "demo@example.com" },
      update: {},
      create: {
        email: "demo@example.com",
        name: "Demo Executive",
        passwordHash: password,
        zId: "z1234567",
      },
    }),
    prisma.user.upsert({
      where: { email: "alice@example.com" },
      update: {},
      create: {
        email: "alice@example.com",
        name: "Alice Chen",
        passwordHash: password,
        zId: "z2345678",
      },
    }),
    prisma.user.upsert({
      where: { email: "bob@example.com" },
      update: {},
      create: {
        email: "bob@example.com",
        name: "Bob Nguyen",
        passwordHash: password,
        zId: "z3456789",
      },
    }),
    prisma.user.upsert({
      where: { email: "charlie@example.com" },
      update: {},
      create: {
        email: "charlie@example.com",
        name: "Charlie Park",
        passwordHash: password,
        zId: "z4567890",
      },
    }),
  ]);

  // Create memberships
  await Promise.all([
    prisma.societyMembership.upsert({
      where: { userId_societyId: { userId: demo.id, societyId: society.id } },
      update: {},
      create: { userId: demo.id, societyId: society.id, role: "EXECUTIVE", title: "President" },
    }),
    prisma.societyMembership.upsert({
      where: { userId_societyId: { userId: alice.id, societyId: society.id } },
      update: {},
      create: { userId: alice.id, societyId: society.id, role: "EXECUTIVE", title: "Secretary" },
    }),
    prisma.societyMembership.upsert({
      where: { userId_societyId: { userId: bob.id, societyId: society.id } },
      update: {},
      create: { userId: bob.id, societyId: society.id, role: "DIRECTOR", title: "CTF Director", portfolioId: portfolioByName.get("CTF")!.id },
    }),
    prisma.societyMembership.upsert({
      where: { userId_societyId: { userId: charlie.id, societyId: society.id } },
      update: {},
      create: { userId: charlie.id, societyId: society.id, role: "SUBCOMMITTEE", title: "Creative Subcom", portfolioId: portfolioByName.get("Creatives")!.id },
    }),
  ]);

  // Titles. Each portfolio has a director and a subcom title, which is what puts a
  // member in that portfolio. Executive titles belong to no portfolio.
  const defaultTitles: {
    name: string;
    roleLevel: "EXECUTIVE" | "DIRECTOR" | "SUBCOMMITTEE";
    sortOrder: number;
    portfolioId: string | null;
  }[] = [
    ...EXEC_TITLES.map((name, i) => ({
      name,
      roleLevel: "EXECUTIVE" as const,
      sortOrder: i,
      portfolioId: null,
    })),
    ...BASE_PORTFOLIOS.flatMap((p, i) => [
      {
        name: directorTitle(p),
        roleLevel: "DIRECTOR" as const,
        sortOrder: i,
        portfolioId: portfolioByName.get(p.name)!.id,
      },
      {
        name: subcomTitle(p),
        roleLevel: "SUBCOMMITTEE" as const,
        sortOrder: i,
        portfolioId: portfolioByName.get(p.name)!.id,
      },
    ]),
  ];
  for (const t of defaultTitles) {
    await prisma.societyTitle.upsert({
      where: { societyId_name_roleLevel: { societyId: society.id, name: t.name, roleLevel: t.roleLevel } },
      update: { portfolioId: t.portfolioId, sortOrder: t.sortOrder },
      create: { societyId: society.id, ...t },
    });
  }

  // Sample announcement
  await prisma.announcement.upsert({
    where: { id: "ann-welcome" },
    update: {},
    create: {
      id: "ann-welcome",
      societyId: society.id,
      authorId: demo.id,
      title: "Welcome to the Society Platform! 🎉",
      content: "This is your centralised society management platform. Use the sidebar to navigate to content requests, room bookings, and treasury reimbursements.",
      isPinned: true,
    },
  });

  console.log("✅ Seeding complete!");
  console.log("");
  console.log(`Demo accounts (password: ${demoPassword}):`);
  console.log("  demo@example.com    Executive (President & Treasurer)");
  console.log("  alice@example.com   Executive (Secretary)");
  console.log("  bob@example.com     Director (CTF)");
  console.log("  charlie@example.com Subcommittee (Creatives)");
  console.log("");
  console.log("Visit: http://localhost:3000/secsoc/dashboard");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

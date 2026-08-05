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
      contactEmail: "contact@secsoc.unsw.edu.au",
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

  // Create demo users
  const password = await bcrypt.hash("password123", 12);

  const [maahir, alice, bob, charlie] = await Promise.all([
    prisma.user.upsert({
      where: { email: "maahir@unswsecurity.com" },
      update: {},
      create: {
        email: "maahir@unswsecurity.com",
        name: "Maahir Ahmed",
        passwordHash: password,
        zId: "z1234567",
      },
    }),
    prisma.user.upsert({
      where: { email: "alice@secsoc.unsw.edu.au" },
      update: {},
      create: {
        email: "alice@secsoc.unsw.edu.au",
        name: "Alice Chen",
        passwordHash: password,
        zId: "z2345678",
      },
    }),
    prisma.user.upsert({
      where: { email: "bob@secsoc.unsw.edu.au" },
      update: {},
      create: {
        email: "bob@secsoc.unsw.edu.au",
        name: "Bob Nguyen",
        passwordHash: password,
        zId: "z3456789",
      },
    }),
    prisma.user.upsert({
      where: { email: "charlie@secsoc.unsw.edu.au" },
      update: {},
      create: {
        email: "charlie@secsoc.unsw.edu.au",
        name: "Charlie Park",
        passwordHash: password,
        zId: "z4567890",
      },
    }),
  ]);

  // Create memberships
  await Promise.all([
    prisma.societyMembership.upsert({
      where: { userId_societyId: { userId: maahir.id, societyId: society.id } },
      update: {},
      create: { userId: maahir.id, societyId: society.id, role: "EXECUTIVE", title: "President" },
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
      authorId: maahir.id,
      title: "Welcome to the Society Platform! 🎉",
      content: "This is your centralised society management platform. Use the sidebar to navigate to content requests, room bookings, and treasury reimbursements.",
      isPinned: true,
    },
  });

  console.log("✅ Seeding complete!");
  console.log("");
  console.log("Demo accounts (password: password123):");
  console.log("  maahir@unswsecurity.com    Executive (President & Treasurer)");
  console.log("  alice@secsoc.unsw.edu.au   Executive (Secretary)");
  console.log("  bob@secsoc.unsw.edu.au     Director (CTF)");
  console.log("  charlie@secsoc.unsw.edu.au Subcommittee (Creatives)");
  console.log("");
  console.log("Visit: http://localhost:3000/secsoc/dashboard");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

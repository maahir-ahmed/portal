import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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

  // Create demo departments
  const [marketing, technical] = await Promise.all([
    prisma.department.upsert({ where: { id: "dept-marketing" }, update: {}, create: { id: "dept-marketing", societyId: society.id, name: "Marketing" } }),
    prisma.department.upsert({ where: { id: "dept-technical" }, update: {}, create: { id: "dept-technical", societyId: society.id, name: "Technical" } }),
    prisma.department.upsert({ where: { id: "dept-events" }, update: {}, create: { id: "dept-events", societyId: society.id, name: "Events" } }),
  ]);

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
      create: { userId: maahir.id, societyId: society.id, role: "EXECUTIVE", title: "President & Treasurer" },
    }),
    prisma.societyMembership.upsert({
      where: { userId_societyId: { userId: alice.id, societyId: society.id } },
      update: {},
      create: { userId: alice.id, societyId: society.id, role: "EXECUTIVE", title: "Secretary", departmentId: marketing.id },
    }),
    prisma.societyMembership.upsert({
      where: { userId_societyId: { userId: bob.id, societyId: society.id } },
      update: {},
      create: { userId: bob.id, societyId: society.id, role: "DIRECTOR", title: "Technical Director", departmentId: technical.id },
    }),
    prisma.societyMembership.upsert({
      where: { userId_societyId: { userId: charlie.id, societyId: society.id } },
      update: {},
      create: { userId: charlie.id, societyId: society.id, role: "SUBCOMMITTEE", title: "Marketing Subcom", departmentId: marketing.id },
    }),
  ]);

  // Default titles
  const defaultTitles: { name: string; roleLevel: "EXECUTIVE" | "DIRECTOR" | "SUBCOMMITTEE"; sortOrder: number }[] = [
    { name: "President", roleLevel: "EXECUTIVE", sortOrder: 0 },
    { name: "Vice President", roleLevel: "EXECUTIVE", sortOrder: 1 },
    { name: "Secretary", roleLevel: "EXECUTIVE", sortOrder: 2 },
    { name: "Treasurer", roleLevel: "EXECUTIVE", sortOrder: 3 },
    { name: "Arc Delegate", roleLevel: "EXECUTIVE", sortOrder: 4 },
    { name: "Welfare Officer", roleLevel: "EXECUTIVE", sortOrder: 5 },
    { name: "Marketing Director", roleLevel: "DIRECTOR", sortOrder: 0 },
    { name: "Technical Director", roleLevel: "DIRECTOR", sortOrder: 1 },
    { name: "Events Director", roleLevel: "DIRECTOR", sortOrder: 2 },
    { name: "Sponsorship Director", roleLevel: "DIRECTOR", sortOrder: 3 },
    { name: "Education Director", roleLevel: "DIRECTOR", sortOrder: 4 },
    { name: "Competitions Director", roleLevel: "DIRECTOR", sortOrder: 5 },
    { name: "Outreach Director", roleLevel: "DIRECTOR", sortOrder: 6 },
    { name: "Marketing Subcom", roleLevel: "SUBCOMMITTEE", sortOrder: 0 },
    { name: "Technical Subcom", roleLevel: "SUBCOMMITTEE", sortOrder: 1 },
    { name: "Events Subcom", roleLevel: "SUBCOMMITTEE", sortOrder: 2 },
    { name: "General Subcom", roleLevel: "SUBCOMMITTEE", sortOrder: 3 },
  ];
  for (const t of defaultTitles) {
    await prisma.societyTitle.upsert({
      where: { societyId_name_roleLevel: { societyId: society.id, name: t.name, roleLevel: t.roleLevel } },
      update: {},
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
  console.log("  maahir@unswsecurity.com   — Executive (President & Treasurer)");
  console.log("  alice@secsoc.unsw.edu.au  — Executive (Secretary)");
  console.log("  bob@secsoc.unsw.edu.au    — Director");
  console.log("  charlie@secsoc.unsw.edu.au — Subcommittee");
  console.log("");
  console.log("Visit: http://localhost:3000/secsoc/dashboard");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

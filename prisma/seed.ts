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


  // The invented dataset below is for the public no-login demo only. It must never
  // run against the live society database, so it is opt-in: SEED_DEMO_DATA=1.
  if (process.env.SEED_DEMO_DATA === "1") {
    // ---------------------------------------------------------------------------
    // Demo records for the public no-login stack. Every person, email, zID, phone
    // and bank detail below is invented; the event names deliberately mirror the
    // invented ones in src/lib/rubricDemoSnapshot.json so the app's own records and
    // the Rubric tab tell the same story. Fixed ids keep a re-run idempotent.
    // ---------------------------------------------------------------------------
    const at = (day: string, time = "12:00") => new Date(`${day}T${time}:00Z`);

    const cast = [
      { key: "priya", email: "priya@example.com", name: "Priya Raman", zId: "z5100001", role: "EXECUTIVE" as const, title: "Treasurer", portfolio: null },
      { key: "tom", email: "tom@example.com", name: "Tom Whitfield", zId: "z5100002", role: "EXECUTIVE" as const, title: "Vice President", portfolio: null },
      { key: "hana", email: "hana@example.com", name: "Hana Okafor", zId: "z5100003", role: "DIRECTOR" as const, title: "Marketing Director", portfolio: "Marketing" },
      { key: "deniz", email: "deniz@example.com", name: "Deniz Yilmaz", zId: "z5100004", role: "DIRECTOR" as const, title: "Socials Director", portfolio: "Socials" },
      { key: "sam", email: "sam@example.com", name: "Sam Ferreira", zId: "z5100005", role: "DIRECTOR" as const, title: "Careers Director", portfolio: "Careers" },
      { key: "yuki", email: "yuki@example.com", name: "Yuki Tanaka", zId: "z5100006", role: "SUBCOMMITTEE" as const, title: "Education Subcom", portfolio: "Education" },
      { key: "olive", email: "olive@example.com", name: "Olive Nakamura", zId: "z5100007", role: "SUBCOMMITTEE" as const, title: "Media Subcom", portfolio: "Media" },
    ];

    const people: Record<string, string> = { demo: demo.id, alice: alice.id, bob: bob.id, charlie: charlie.id };
    const membershipIds: Record<string, string> = {};

    for (const p of cast) {
      const u = await prisma.user.upsert({
        where: { email: p.email },
        update: {},
        create: { email: p.email, name: p.name, passwordHash: password, zId: p.zId },
      });
      people[p.key] = u.id;
      const m = await prisma.societyMembership.upsert({
        where: { userId_societyId: { userId: u.id, societyId: society.id } },
        update: { role: p.role, title: p.title },
        create: {
          userId: u.id,
          societyId: society.id,
          role: p.role,
          title: p.title,
          portfolioId: p.portfolio ? portfolioByName.get(p.portfolio)!.id : null,
        },
      });
      membershipIds[p.key] = m.id;
    }

    for (const [key, userId] of Object.entries({ demo: demo.id, alice: alice.id, bob: bob.id, charlie: charlie.id })) {
      const m = await prisma.societyMembership.findUnique({
        where: { userId_societyId: { userId, societyId: society.id } },
      });
      if (m) membershipIds[key] = m.id;
    }

    // Budget: one line per portfolio plus the society-wide categories.
    const budgets = [
      { name: "Careers", group: "PORTFOLIO", yearlyBudget: 4200, budget2025: 3800, usage2025: 3610 },
      { name: "Conferences", group: "PORTFOLIO", yearlyBudget: 6000, budget2025: 5500, usage2025: 5120 },
      { name: "Creatives", group: "PORTFOLIO", yearlyBudget: 1800, budget2025: 1500, usage2025: 1385 },
      { name: "CTF", group: "PORTFOLIO", yearlyBudget: 3600, budget2025: 3200, usage2025: 3040 },
      { name: "Education", group: "PORTFOLIO", yearlyBudget: 2400, budget2025: 2200, usage2025: 1870 },
      { name: "Marketing", group: "PORTFOLIO", yearlyBudget: 2800, budget2025: 2600, usage2025: 2515 },
      { name: "Projects", group: "PORTFOLIO", yearlyBudget: 2000, budget2025: 1800, usage2025: 1240 },
      { name: "Socials", group: "PORTFOLIO", yearlyBudget: 5200, budget2025: 4800, usage2025: 4720 },
      { name: "Media", group: "PORTFOLIO", yearlyBudget: 1600, budget2025: 1400, usage2025: 1180 },
      { name: "Merchandise", group: "OTHER", yearlyBudget: 3000, budget2025: 2500, usage2025: 2480 },
      { name: "Operations", group: "OTHER", yearlyBudget: 1200, budget2025: 1100, usage2025: 940 },
    ];
    const budgetIds: Record<string, string> = {};
    for (const [i, b] of budgets.entries()) {
      const row = await prisma.budgetCategory.upsert({
        where: { societyId_name: { societyId: society.id, name: b.name } },
        update: { group: b.group, yearlyBudget: b.yearlyBudget, sortOrder: i },
        create: { societyId: society.id, ...b, sortOrder: i },
      });
      budgetIds[b.name] = row.id;
    }

    // Fake bank details. 123-456 is not a real BSB prefix in use.
    const bank = await prisma.bankAccount.upsert({
      where: { id: "demo-bank-1" },
      update: {},
      create: {
        id: "demo-bank-1",
        userId: people.bob,
        accountName: "B. Nguyen",
        bsb: "123-456",
        accountNumber: "12345678",
        isDefault: true,
      },
    });

    const contentRequests = [
      {
        id: "demo-cr-1", eventName: "CTF Beginners Workshop", by: "bob", assigned: "charlie",
        start: at("2026-07-30", "18:00"), deadline: at("2026-07-16"), location: "Ainsworth G03",
        keyPoints: "Two-hour intro to jeopardy CTFs: web, crypto and forensics warmups on our own scoreboard. Bring a laptop, no prior experience needed. Pizza afterwards.",
        status: "COMPLETED", banner: true, blurb: true, rubric: true, bannerDone: true, blurbDone: true,
        grant: "PAID",
        finishedBlurb: "New to CTFs? Start here. We'll walk through the three categories that show up in every beginner competition and get you your first flag on the night. Laptops out, pizza on us.",
      },
      {
        id: "demo-cr-2", eventName: "Industry Night", by: "sam", assigned: "hana",
        start: at("2026-07-16", "17:30"), deadline: at("2026-07-01"), location: "Roundhouse",
        keyPoints: "Six sponsor tables, 45 minutes of speed networking then open floor. Business casual. Catering for 180.",
        status: "COMPLETED", banner: true, blurb: true, rubric: true, bannerDone: true, blurbDone: true,
        grant: "APPROVED",
        finishedBlurb: "Meet the teams hiring right now. Six security employers, one room, and 45 minutes of speed networking before the floor opens.",
      },
      {
        id: "demo-cr-3", eventName: "Capture the Flag: Winter", by: "bob", assigned: "charlie",
        start: at("2026-06-28", "10:00"), end: at("2026-06-28", "18:00"), deadline: at("2026-06-12"),
        location: "CATS Room + online", keyPoints: "Eight-hour open CTF, teams of four, prizes for top three and best writeup.",
        status: "COMPLETED", banner: true, blurb: true, rubric: true, bannerDone: true, blurbDone: true,
        grant: "SUBMITTED",
      },
      {
        id: "demo-cr-4", eventName: "Security Trivia Night", by: "deniz", assigned: "charlie",
        start: at("2026-09-11", "18:30"), deadline: at("2026-08-28"), location: "Whitehouse",
        keyPoints: "Six rounds, teams of five, prize for best team name. Need a banner and a ticket link by the 28th.",
        status: "IN_PROGRESS", banner: true, blurb: true, rubric: true, bannerDone: true, blurbDone: false,
      },
      {
        id: "demo-cr-5", eventName: "Intro to Binary Exploitation", by: "yuki", assigned: null,
        start: at("2026-09-24", "18:00"), deadline: at("2026-09-10"), location: "Ainsworth 202",
        keyPoints: "Stack smashing from first principles, ret2libc at the end if time allows. Capped at 60, laptops required.",
        status: "SUBMITTED", banner: true, blurb: true, rubric: true,
      },
      {
        id: "demo-cr-6", eventName: "Careers Panel: Blue Team vs Red Team", by: "sam", assigned: "hana",
        start: at("2026-10-08", "17:30"), deadline: at("2026-09-24"), location: "Colombo Theatre B",
        keyPoints: "Four panellists, two from each side, moderated Q&A then 30 minutes of mingling. Confirm headshots with marketing.",
        status: "ASSIGNED", banner: true, blurb: true, rubric: true,
      },
      {
        id: "demo-cr-7", eventName: "Sec-a-thon 2026", by: "tom", assigned: "hana",
        start: at("2026-10-25", "09:00"), end: at("2026-10-26", "16:00"), deadline: at("2026-10-01"),
        location: "TBC — upper campus", keyPoints: "Overnight build weekend with three sponsor challenges. Still waiting on the venue and the final sponsor list before marketing can start.",
        status: "AWAITING_INFORMATION", banner: true, blurb: true, rubric: false,
        otherNotes: "Blocked on the venue. Marketing can't size the banner until we know if it's the Roundhouse or Ainsworth.",
      },
      {
        id: "demo-cr-8", eventName: "End of Year Party", by: "deniz", assigned: null,
        start: at("2026-11-20", "19:00"), deadline: at("2026-11-06"), location: "TBC",
        keyPoints: "Cocktail night to close out the year. Rough draft only, numbers and venue still moving.",
        status: "DRAFT", banner: false, blurb: true, rubric: false,
      },
    ];

    for (const c of contentRequests) {
      await prisma.contentRequest.upsert({
        where: { id: c.id },
        update: {},
        create: {
          id: c.id,
          societyId: society.id,
          submittedById: people[c.by],
          assignedToId: c.assigned ? people[c.assigned] : null,
          eventName: c.eventName,
          startDate: c.start,
          endDate: c.end ?? null,
          location: c.location,
          keyPoints: c.keyPoints,
          deadline: c.deadline,
          bannerRequired: c.banner ?? false,
          blurbRequired: c.blurb ?? false,
          rubricRequired: c.rubric ?? false,
          otherNotes: c.otherNotes ?? null,
          status: c.status as never,
          bannerDone: c.bannerDone ?? false,
          blurbDone: c.blurbDone ?? false,
          finishedBlurb: c.finishedBlurb ?? null,
          activityGrantStatus: (c.grant ?? "NOT_SUBMITTED") as never,
          ...(c.rubric && c.status === "COMPLETED"
            ? { rubricEventId: "9101", rubricEventLink: "https://portal.hellorubric.com/events/9101", rubricSubmittedAt: c.deadline }
            : {}),
        },
      });
      await prisma.thread.upsert({
        where: { id: `demo-th-cr-${c.id}` },
        update: {},
        create: { id: `demo-th-cr-${c.id}`, contentRequestId: c.id },
      });
    }

    await prisma.contentDeliverable.upsert({
      where: { id: "demo-del-1" },
      update: {},
      create: {
        id: "demo-del-1",
        contentRequestId: "demo-cr-4",
        fileName: "trivia-night-banner.png",
        fileUrl: "/uploads/demo/trivia-night-banner.png",
      },
    });

    const roomBookings = [
      {
        id: "demo-rb-1", eventName: "Intro to Binary Exploitation", type: "WORKSHOP", by: "yuki",
        date: at("2026-09-24"), start: "18:00", end: "20:00", location: "SECLAB", max: 60,
        description: "Hands-on workshop working up from a plain stack overflow to a ret2libc. Attendees work on our own VMs, nothing touches university machines.",
        requirements: "Lab machines or BYO laptops, projector, whiteboard. Upper campus preferred.",
        status: "SUBMITTED",
        officer: { name: "Yuki Tanaka", zid: "z5100006", phone: "0400 111 222" },
      },
      {
        id: "demo-rb-2", eventName: "Careers Panel: Blue Team vs Red Team", type: "PRESENTATION_TALK_PANEL", by: "sam",
        date: at("2026-10-08"), start: "17:30", end: "20:00", location: "LECTURE_THEATRE", max: 200,
        description: "Moderated panel with four industry guests, followed by light catering and networking in the foyer.",
        requirements: "Tiered theatre, two handheld mics plus a lapel, HDMI to the lectern, foyer space for catering.",
        status: "UNDER_REVIEW", external: true, extNum: 4,
        extDesc: "Four panellists from local security teams, speaking in a personal capacity. No payment, travel reimbursed at cost.",
        officer: { name: "Sam Ferreira", zid: "z5100005", phone: "0400 333 444" },
      },
      {
        id: "demo-rb-3", eventName: "Sec-a-thon 2026", type: "WORKSHOP", by: "tom",
        date: at("2026-10-25"), start: "09:00", end: "22:00", location: "OTHER", max: 120,
        description: "Overnight build weekend with three sponsor challenges. Needs a room we can hold past 6pm with a nearby kitchen or breakout space.",
        requirements: "After-hours access, power for 120 laptops, breakout room for judging, accessible bathrooms on the same floor.",
        status: "WAITING_ON_INFORMATION", external: true, extNum: 6,
        extDesc: "Six sponsor representatives running challenge desks. Sponsorship is settled separately with the treasurer; no payment on the day.",
        officer: { name: "Tom Whitfield", zid: "z5100002", phone: "0400 555 666" },
      },
      {
        id: "demo-rb-4", eventName: "Annual General Meeting", type: "GENERAL_MEETING", by: "alice",
        date: at("2026-09-18"), start: "17:00", end: "19:00", location: "LECTURE_THEATRE", max: 150,
        description: "Constitutional AGM: annual report, treasurer's report, and election of the incoming committee.",
        requirements: "Tiered theatre with a lectern mic, roving mic for questions, projector for the slides.",
        status: "SUBMITTED_TO_ARC",
        officer: { name: "Alice Chen", zid: "z5000102", phone: "0400 777 888" },
      },
      {
        id: "demo-rb-5", eventName: "Security Trivia Night", type: "SOCIAL_ACTIVITY", by: "deniz",
        date: at("2026-09-11"), start: "18:30", end: "21:30", location: "ROUNDHOUSE", max: 90,
        description: "Six rounds of security trivia in teams of five, with a break for food halfway through.",
        requirements: "Loose tables rather than fixed seating, PA and a microphone, screen for the question slides.",
        status: "APPROVED",
        officer: { name: "Deniz Yilmaz", zid: "z5100004", phone: "0400 999 000" },
      },
      {
        id: "demo-rb-6", eventName: "CTF Beginners Workshop", type: "WORKSHOP", by: "bob",
        date: at("2026-07-30"), start: "18:00", end: "20:00", location: "CATS_ROOM", max: 80,
        description: "Beginner-friendly walkthrough of web, crypto and forensics warmups on our own scoreboard.",
        requirements: "Flat room with power at every seat, projector, wired network if possible.",
        status: "COMPLETED",
        officer: { name: "Bob Nguyen", zid: "z5000103", phone: "0411 222 333" },
      },
      {
        id: "demo-rb-8", eventName: "Sponsor Site Visit", type: "NETWORKING_INDUSTRY", by: "sam",
        date: at("2026-09-02"), start: "12:00", end: "15:00", location: "OUTDOOR_SPACE", max: 30,
        description: "Small-group visit from a sponsor's graduate team: a short talk on the library lawn, then lunch with students who signed up.",
        requirements: "Outdoor space with shade and a power point for the PA. Wet weather backup room if one is going.",
        status: "SUBMITTED", external: true, extNum: 3,
        extDesc: "Three staff from a sponsoring employer, attending in a work capacity. No payment either way; they bring their own lunch catering.",
        officer: { name: "Sam Ferreira", zid: "z5100005", phone: "0400 333 444" },
      },
      {
        id: "demo-rb-7", eventName: "Movie Night: Hackers (1995)", type: "MOVIE_NIGHT", by: "charlie",
        date: at("2026-08-14"), start: "18:00", end: "21:00", location: "LECTURE_THEATRE", max: 70,
        description: "Screening with a short intro on how little of it is accurate, then discussion.",
        requirements: "Theatre with working sound, HDMI, and lights we can dim.",
        status: "REJECTED",
        officer: { name: "Charlie Park", zid: "z5000104", phone: "0422 333 444" },
      },
    ];

    for (const r of roomBookings) {
      await prisma.roomBooking.upsert({
        where: { id: r.id },
        update: {},
        create: {
          id: r.id,
          societyId: society.id,
          submittedById: people[r.by],
          eventName: r.eventName,
          eventType: r.type as never,
          preferredDate: r.date,
          startTime: r.start,
          endTime: r.end,
          description: r.description,
          maxAttendees: r.max,
          hasExternalGuests: r.external ?? false,
          externalGuestsDesc: r.extDesc ?? null,
          numExternalGuests: r.extNum ?? null,
          preferredLocation: r.location as never,
          safetyOfficerName: r.officer.name,
          safetyOfficerZid: r.officer.zid,
          safetyOfficerPhone: r.officer.phone,
          roomRequirements: r.requirements,
          status: r.status as never,
          ...(r.status === "SUBMITTED_TO_ARC" ? { submittedToArcAt: at("2026-08-21") } : {}),
        },
      });
      await prisma.thread.upsert({
        where: { id: `demo-th-rb-${r.id}` },
        update: {},
        create: { id: `demo-th-rb-${r.id}`, roomBookingId: r.id },
      });
    }

    const treasury = [
      {
        id: "demo-tr-1", by: "bob", email: "bob@example.com", date: at("2026-07-30"),
        supplier: "Pizza Hub Kensington", description: "Twelve pizzas for the CTF Beginners Workshop, receipt attached.",
        amount: 214.5, category: "CTF", status: "REIMBURSED",
      },
      {
        id: "demo-tr-2", by: "hana", email: "hana@example.com", date: at("2026-07-16"),
        supplier: "Officeworks Kingsford", description: "Lanyards and name badges for Industry Night.",
        amount: 96.4, category: "Marketing", status: "REIMBURSED",
      },
      {
        id: "demo-tr-3", by: "deniz", email: "deniz@example.com", date: at("2026-08-19"),
        supplier: "Kmart Eastgardens", description: "Prizes for Security Trivia Night — three gift cards and a novelty trophy.",
        amount: 158.0, category: "Socials", status: "REIMBURSEMENT_PENDING",
      },
      {
        id: "demo-tr-4", by: "charlie", email: "charlie@example.com", date: at("2026-08-22"),
        supplier: "Adobe", description: "Two months of Creative Cloud for the poster and banner work.",
        amount: 87.98, category: "Creatives", status: "REIMBURSEMENT_PENDING",
      },
      {
        id: "demo-tr-5", by: "yuki", email: "yuki@example.com", date: at("2026-08-24"),
        supplier: "Bunnings Randwick", description: "Extension leads and power boards for the binary exploitation workshop.",
        amount: 64.85, category: "Education", status: "DRAFT",
      },
      {
        id: "demo-tr-6", by: "tom", email: "tom@example.com", date: at("2026-06-02"),
        supplier: "Uber", description: "Taxi home after the June committee dinner.",
        amount: 41.2, category: "Operations", status: "REJECTED",
      },
    ];

    for (const t of treasury) {
      await prisma.treasuryRequest.upsert({
        where: { id: t.id },
        update: {},
        create: {
          id: t.id,
          societyId: society.id,
          submittedById: people[t.by],
          contactEmail: t.email,
          expenseDate: t.date,
          locationSupplier: t.supplier,
          description: t.description,
          amount: t.amount,
          bankAccountId: t.by === "bob" ? bank.id : null,
          budgetCategoryId: budgetIds[t.category],
          status: t.status as never,
          acknowledgedRules: t.status !== "DRAFT",
        },
      });
      await prisma.thread.upsert({
        where: { id: `demo-th-tr-${t.id}` },
        update: {},
        create: { id: `demo-th-tr-${t.id}`, treasuryRequestId: t.id },
      });
    }

    const printing = [
      {
        id: "demo-pr-1", by: "hana", name: "Hana Okafor", email: "hana@example.com", phone: "0400 121 212",
        pickup: at("2026-09-04", "14:00"), quantity: 40, pages: 1, size: "A3", sided: "SINGLE", colour: "COLOUR",
        file: "trivia-night-poster.pdf", cost: 68.0, status: "PENDING_ARC_SUBMISSION",
        notes: "Please keep the bleed — the border is part of the design.",
      },
      {
        id: "demo-pr-2", by: "charlie", name: "Charlie Park", email: "charlie@example.com", phone: "0422 333 444",
        pickup: at("2026-09-17", "11:00"), quantity: 200, pages: 1, size: "A4", sided: "SINGLE", colour: "BW",
        file: "binex-workshop-flyer.pdf", cost: 24.0, status: "PENDING_APPROVAL",
      },
      {
        id: "demo-pr-3", by: "sam", name: "Sam Ferreira", email: "sam@example.com", phone: "0400 333 444",
        pickup: at("2026-08-25", "10:30"), quantity: 60, pages: 4, size: "A4", sided: "DOUBLE_LONG", colour: "COLOUR",
        file: "careers-panel-programme.pdf", cost: 132.0, status: "SUBMITTED",
        notes: "Stapled top-left if the machine can do it.",
      },
      {
        id: "demo-pr-4", by: "olive", name: "Olive Nakamura", email: "olive@example.com", phone: "0433 444 555",
        pickup: at("2026-07-28", "15:00"), quantity: 25, pages: 2, size: "A3", sided: "DOUBLE_SHORT", colour: "COLOUR",
        file: "ctf-scoreboard-signage.pdf", cost: 87.5, status: "READY_FOR_PICKUP",
      },
    ];

    for (const p of printing) {
      await prisma.printingRequest.upsert({
        where: { id: p.id },
        update: {},
        create: {
          id: p.id,
          societyId: society.id,
          submittedById: people[p.by],
          clubName: society.name,
          contactName: p.name,
          contactEmail: p.email,
          contactPhone: p.phone,
          pickupAt: p.pickup,
          quantity: p.quantity,
          pages: p.pages,
          paperSize: p.size,
          sided: p.sided,
          colour: p.colour,
          fileUrl: `/uploads/demo/${p.file}`,
          fileName: p.file,
          additionalDetails: p.notes ?? null,
          cost: p.cost,
          status: p.status as never,
          ...(p.status !== "PENDING_APPROVAL" ? { decidedById: demo.id, decidedAt: at("2026-08-20") } : {}),
        },
      });
    }

    // A few threads with conversation on them, including one exec-only note.
    const comments = [
      { id: "demo-c-1", thread: "demo-th-cr-demo-cr-4", by: "charlie", content: "Banner's done and uploaded. Want me to do a story-sized crop as well?" },
      { id: "demo-c-2", thread: "demo-th-cr-demo-cr-4", by: "deniz", content: "Yes please — 1080x1920. Blurb is still with me, you'll have it Thursday." },
      { id: "demo-c-3", thread: "demo-th-cr-demo-cr-7", by: "hana", content: "Can't size anything until the venue lands. Roundhouse and Ainsworth need different artwork." },
      { id: "demo-c-4", thread: "demo-th-cr-demo-cr-7", by: "demo", content: "Chasing Arc today. If we don't hear back by Friday we book Ainsworth and move on.", internal: true },
      { id: "demo-c-5", thread: "demo-th-rb-demo-rb-3", by: "tom", content: "Arc came back asking for after-hours justification and a second safety officer. Drafting a reply." },
      { id: "demo-c-6", thread: "demo-th-rb-demo-rb-2", by: "alice", content: "Panellist list confirmed, four names. Adding them to the external guests section now." },
      { id: "demo-c-7", thread: "demo-th-tr-demo-tr-3", by: "priya", content: "Receipt is legible, category looks right. Paying this out in Friday's batch." },
      { id: "demo-c-8", thread: "demo-th-tr-demo-tr-6", by: "priya", content: "Arc won't fund taxis home from a social. Rejecting — happy to talk it through if you want.", internal: false },
    ];

    for (const c of comments) {
      await prisma.comment.upsert({
        where: { id: c.id },
        update: {},
        create: {
          id: c.id,
          threadId: c.thread,
          authorId: people[c.by],
          content: c.content,
          isInternal: c.internal ?? false,
        },
      });
    }

    const announcements = [
      {
        id: "demo-ann-agm",
        title: "AGM is on 18 September — nominations open",
        content: "Nominations for the 2027 committee close at 5pm on 11 September. Every position is open, including the executive roles. If you're thinking about running and want to know what a role actually involves, grab whoever currently holds it.",
        author: "alice", pinned: true,
      },
      {
        id: "demo-ann-reimb",
        title: "Reimbursements now run in weekly batches",
        content: "Claims approved by Thursday 5pm go out in Friday's batch. Attach the itemised receipt, not the card slip — Arc rejects anything that doesn't show what was bought.",
        author: "priya", pinned: false,
      },
    ];

    for (const a of announcements) {
      await prisma.announcement.upsert({
        where: { id: a.id },
        update: {},
        create: {
          id: a.id,
          societyId: society.id,
          authorId: people[a.author],
          title: a.title,
          content: a.content,
          isPinned: a.pinned,
        },
      });
    }

    // AHEGS: committee meetings, who turned up, and this year's entries.
    const meetings = [
      { id: "demo-mtg-1", title: "Executive meeting — Week 1", date: at("2026-07-21", "17:00"), hours: 1.5, exec: true, portfolio: null, present: ["demo", "alice", "priya", "tom"] },
      { id: "demo-mtg-2", title: "All-committee meeting — Term 3 kickoff", date: at("2026-07-28", "18:00"), hours: 2, exec: false, portfolio: null, present: ["demo", "alice", "priya", "tom", "bob", "hana", "deniz", "sam", "yuki", "olive", "charlie"] },
      { id: "demo-mtg-3", title: "CTF planning — Sec-a-thon challenges", date: at("2026-08-04", "18:00"), hours: 1, exec: false, portfolio: "CTF", present: ["bob", "yuki"] },
      { id: "demo-mtg-4", title: "Marketing sync", date: at("2026-08-11", "17:30"), hours: 1, exec: false, portfolio: "Marketing", present: ["hana", "charlie", "olive"] },
      { id: "demo-mtg-5", title: "Executive meeting — mid-term", date: at("2026-08-18", "17:00"), hours: 1.5, exec: true, portfolio: null, present: ["demo", "alice", "priya", "tom"] },
    ];

    for (const m of meetings) {
      await prisma.ahegsMeeting.upsert({
        where: { id: m.id },
        update: {},
        create: {
          id: m.id,
          societyId: society.id,
          portfolioId: m.portfolio ? portfolioByName.get(m.portfolio)!.id : null,
          execTeam: m.exec,
          year: 2026,
          title: m.title,
          date: m.date,
          hours: m.hours,
          createdById: demo.id,
        },
      });
      for (const key of m.present) {
        if (!membershipIds[key]) continue;
        await prisma.ahegsAttendance.upsert({
          where: { meetingId_membershipId: { meetingId: m.id, membershipId: membershipIds[key] } },
          update: {},
          create: { meetingId: m.id, membershipId: membershipIds[key] },
        });
      }
    }

    const ahegsCategory: Record<string, string> = {
      demo: "EXECUTIVE", alice: "EXECUTIVE", priya: "EXECUTIVE", tom: "EXECUTIVE",
      bob: "DIRECTOR", hana: "DIRECTOR", deniz: "DIRECTOR", sam: "DIRECTOR",
      yuki: "SUBCOMMITTEE", olive: "SUBCOMMITTEE", charlie: "SUBCOMMITTEE",
    };
    const extraHours: Record<string, number> = { bob: 14, hana: 9, deniz: 7, charlie: 11, yuki: 5 };

    for (const [key, membershipId] of Object.entries(membershipIds)) {
      await prisma.ahegsEntry.upsert({
        where: { membershipId_year: { membershipId, year: 2026 } },
        update: {},
        create: {
          societyId: society.id,
          membershipId,
          year: 2026,
          category: (ahegsCategory[key] ?? "SUBCOMMITTEE") as never,
          included: true,
          startDate: at("2026-03-01"),
          endDate: at("2026-11-30"),
          hoursAdjustment: extraHours[key] ?? null,
        },
      });
    }
  }

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

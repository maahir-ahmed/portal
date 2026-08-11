import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getRubricCredentials } from "../src/lib/rubric";
import { anonymisePeople } from "../src/lib/rubricDemo";

// Refresh src/lib/rubricDemoSnapshot.json from a connected deployment, so the
// public demo shows this society's real aggregates instead of invented ones.
//
// Run it where the Rubric session lives (the production stack), never on the demo:
//   docker compose --env-file deploy/.env.prod -p rubric_prod -f deploy/docker-compose.yml \
//     --profile seed run --rm seed npx tsx scripts/rubric-snapshot.ts > snapshot.json
//
// Only aggregates are meant to survive: every person the response names is
// replaced below before anything is written, because the file ends up in git and
// on a site with no login.

const CALLS: [string, Record<string, unknown>][] = [
  ["getSocietyPortalMembershipList", { viewFilter: "active" }],
  ["getSocietyPortalMembershipHomePage", {}],
  ["getSocietyPortalTicketingHomePage", {}],
  ["getSocietyPortalSettlementList", {}],
  ["getSocietyTeamMembers", { complete: true }],
  ["getMerchListings", {}],
  ["getMerchOrders", {}],
];

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const society = await prisma.society.findFirstOrThrow({ select: { id: true } });
  const creds = await getRubricCredentials(society.id);
  if (!creds) throw new Error("This deployment has no Rubric credentials; run it on the connected stack.");

  const responses: Record<string, unknown> = {};
  for (const [type, params] of CALLS) {
    const res = await fetch(`https://api.hellorubric.com/${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...params,
        type,
        sessionid: creds.sessionId,
        societyID: creds.societyId,
        currentUrl: "https://portal.hellorubric.com/",
        device: "web_portal",
        version: 4,
        timestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`${type}: HTTP ${res.status}`);
    const data = await res.json();
    if (data?.success === false) throw new Error(`${type}: ${data.usererror ?? data.error ?? "rejected"}`);
    responses[type] = anonymisePeople(data);
    console.error(`captured ${type}`);
  }

  const snapshot = { capturedAt: new Date().toISOString().slice(0, 10), responses };
  const out = "src/lib/rubricDemoSnapshot.json";
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");
  console.error(`wrote ${out} (capturedAt ${snapshot.capturedAt})`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

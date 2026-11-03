import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getRubricCredentials, postRubric } from "../src/lib/rubric";
import { scrubResponse } from "../src/lib/rubricCalls";
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
    // Through postRubric, the one place that calls Rubric: it also saves the replacement
    // session Rubric sometimes hands back, which a copy of the call here used to drop.
    const res = await postRubric(society.id, creds, type, params, { timeoutMs: 30_000 });
    if (!res.ok || !res.data) throw new Error(`${type}: HTTP ${res.status}`);
    const data = res.data;
    if (data?.success === false) throw new Error(`${type}: ${data.usererror ?? data.error ?? "rejected"}`);
    // Credentials out first (the file is committed and served with no login), then people.
    responses[type] = anonymisePeople(scrubResponse(data));
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

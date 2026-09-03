import { chromium } from "@playwright/test";

const BASE = "https://rubric.maahir.dev";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState("networkidle");
  await page.goto(`${BASE}/budget`);
  await page.waitForSelector("table tbody tr", { timeout: 30000 });

  const rows = () => page.locator("table tbody tr").count();
  const amounts = async () =>
    (await page.locator("table tbody tr td:nth-child(5)").allTextContents()).map((t) =>
      Number(t.replace(/[^0-9.]/g, ""))
    );
  const summary = () => page.locator("text=/claims? · /").first().innerText();

  const [cat, sort] = await page.locator('button[role="combobox"]').all().then((b) => [b[0], b[1]]);

  console.log("default:", await rows(), "rows |", await summary());
  console.log("  amounts:", await amounts());

  // Sort high to low, then low to high.
  for (const label of ["Amount: high to low", "Amount: low to high", "Oldest first"]) {
    await sort.click();
    await page.getByRole("option", { name: label, exact: true }).click();
    await page.waitForTimeout(250);
    console.log(`${label}:`, await amounts());
  }

  // Filter to one category.
  await sort.click();
  await page.getByRole("option", { name: "Newest first", exact: true }).click();
  await page.waitForTimeout(200);
  await cat.click();
  const options = await page.getByRole("option").allTextContents();
  console.log("category options:", options.join(" | "));
  await page.getByRole("option", { name: "CTF", exact: true }).click();
  await page.waitForTimeout(300);
  console.log("filtered to CTF:", await rows(), "rows |", await summary());
  console.log("  categories shown:", await page.locator("table tbody tr td:nth-child(6)").allTextContents());

  await page.screenshot({ path: "/tmp/claude-1000/-home-maahir-bluebottle/df7a996f-db7b-4b87-a7eb-29bbb9bd21ed/scratchpad/claims.png", clip: { x: 250, y: 400, width: 1190, height: 420 } });
  await browser.close();
}

main();

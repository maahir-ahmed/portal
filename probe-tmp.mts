import { chromium } from "@playwright/test";

const BASE = process.env.PROBE_BASE ?? "https://rubric.maahirahmed.com";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(); // fresh, no cookies
  const page = await ctx.newPage();

  const failures: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  console.log("landed on:", page.url());
  console.log("title:", await page.title());
  console.log("body:", (await page.locator("body").innerText()).slice(0, 300).replace(/\n+/g, " | "));
  console.log("failed requests:", failures.length ? failures.slice(0, 10) : "none");

  await page.screenshot({ path: "/tmp/claude-1000/-home-maahir-bluebottle/df7a996f-db7b-4b87-a7eb-29bbb9bd21ed/scratchpad/loggedout.png" });
  await browser.close();
}

main();

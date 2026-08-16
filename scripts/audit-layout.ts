// Layout audit. Walks the app at phone → desktop widths and reports anything that
// breaks out of the viewport or sits flush against its edge, plus the guided tour's
// hovering box, which is positioned in JS and so can't be caught by reading CSS.
//
// Needs a dev server and an account to sign in with — set AUDIT_EMAIL/AUDIT_PASSWORD,
// or seed one (`npm run db:seed` creates alice@example.com / password123):
//   npm run dev  &&  npm run audit:layout
// Screenshots land in a gitignored directory; they contain real member data, so
// they are written outside the repo unless AUDIT_OUT says otherwise.
import { chromium, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.AUDIT_URL ?? "http://localhost:3000";
const EMAIL = process.env.AUDIT_EMAIL ?? "alice@secsoc.unsw.edu.au";
const PASSWORD = process.env.AUDIT_PASSWORD ?? "password123";
const OUT = process.env.AUDIT_OUT ?? join(tmpdir(), "society-layout-audit");

const VIEWPORTS = [
  { name: "iphone-se", width: 320, height: 568 },
  { name: "android", width: 360, height: 640 },
  { name: "iphone-14", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const PAGES = [
  "/dashboard",
  "/requests/content", "/requests/content/new",
  "/requests/room-booking", "/requests/room-booking/new",
  "/requests/treasury", "/requests/treasury/new",
  "/requests/printing", "/requests/printing/new",
  "/budget", "/executive/queue", "/board", "/members", "/ahegs",
  "/rubric", "/settings", "/account",
];

interface Finding { page: string; viewport: string; kind: string; detail: string }
const findings: Finding[] = [];

/**
 * Two things users actually feel on a phone, measured against the element's nearest
 * clipping/scrolling ancestor rather than the viewport — `main` carries overflow-y-auto,
 * which makes its computed overflow-x `auto`, so a naive viewport comparison either
 * flags everything or nothing.
 *   clipped         — content cut off by an overflow:hidden container. Always a bug.
 *   sideways-scroll — a container that scrolls horizontally at this width.
 */
async function scanOverflow(page: Page) {
  return page.evaluate(() => {
    const out: { kind: string; detail: string }[] = [];
    const label = (el: Element) => {
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 36);
      return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${text ? ` “${text}”` : ""}`;
    };
    const scrolls = (v: string) => v === "auto" || v === "scroll";
    const clips = (v: string) => v === "hidden" || v === "clip";

    // Anything that scrolls sideways at this width, reported once per container.
    for (const el of [document.documentElement, ...Array.from(document.querySelectorAll<HTMLElement>("*"))]) {
      const style = getComputedStyle(el);
      if (!scrolls(style.overflowX) && el !== document.documentElement) continue;
      if (el.scrollWidth <= el.clientWidth + 1 || el.clientWidth === 0) continue;
      const widest = Array.from(el.children).reduce<Element | null>(
        (w, c) => (!w || c.getBoundingClientRect().width > w.getBoundingClientRect().width ? c : w), null);
      out.push({
        kind: "sideways-scroll",
        detail: `${label(el)} scrolls ${el.scrollWidth}px in ${el.clientWidth}px${widest ? ` — widest child ${label(widest)}` : ""}`,
      });
    }

    // A flex child wider than its parent's content box. Nothing clips it, so it
    // paints over its siblings — the queue cards' text ran under their buttons.
    const spilled: Element[] = [];
    for (const parent of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const ps = getComputedStyle(parent);
      if (ps.display !== "flex" && ps.display !== "inline-flex") continue;
      if (scrolls(ps.overflowX) || clips(ps.overflowX)) continue;
      const pr = parent.getBoundingClientRect();
      const right = pr.right - parseFloat(ps.paddingRight || "0");
      if (pr.width < 2) continue;
      for (const child of Array.from(parent.children)) {
        const cs = getComputedStyle(child);
        if (cs.position === "absolute" || cs.position === "fixed" || cs.display === "none") continue;
        const cr = child.getBoundingClientRect();
        if (cr.width < 2 || cr.right <= right + 1) continue;
        if (spilled.some((f) => f.contains(child))) continue;
        spilled.push(child);
        out.push({ kind: "flex-spill", detail: `${label(child)} reaches ${Math.round(cr.right)} past its flex parent's ${Math.round(right)} — ${label(parent)}` });
      }
    }

    // Content cut off by a container that hides its overflow.
    const flagged: Element[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.position === "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (flagged.some((f) => f.contains(el))) continue;

      let box: DOMRect | null = null;
      let clipped = false;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (scrolls(ox)) break;            // user can reach it; handled above
        if (clips(ox)) { box = a.getBoundingClientRect(); clipped = true; break; }
      }
      if (!clipped || !box) continue;
      if (r.right > box.right + 1 || r.left < box.left - 1) {
        flagged.push(el);
        out.push({ kind: "clipped", detail: `${label(el)} spans ${Math.round(r.left)}→${Math.round(r.right)}, cut off at ${Math.round(box.left)}→${Math.round(box.right)}` });
      }
    }
    return out;
  });
}

/** The tour box is placed by tooltipBox() at runtime; assert it misses what it points at. */
async function scanTutorial(page: Page, vw: number) {
  const out: { kind: string; detail: string }[] = [];
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("tutorial:start", { detail: { scope: "page" } })));
  const box = page.locator("div.fixed.inset-0.z-\\[60\\] > div.absolute.overflow-y-auto").first();
  try {
    await box.waitFor({ state: "visible", timeout: 4000 });
  } catch {
    return out; // no page help here
  }
  for (let step = 0; step < 6; step++) {
    await page.waitForTimeout(500);
    const result = await page.evaluate((vw) => {
      const tip = document.querySelector<HTMLElement>("div.fixed.inset-0 > div.absolute.overflow-y-auto");
      const ring = document.querySelector<HTMLElement>("div.fixed.inset-0 > div.absolute.rounded-xl:not(.overflow-y-auto)");
      if (!tip) return null;
      const t = tip.getBoundingClientRect();
      const problems: string[] = [];
      if (t.right > vw + 1 || t.left < -1) problems.push(`box spans ${Math.round(t.left)}→${Math.round(t.right)} outside 0→${vw}`);
      if (t.bottom > window.innerHeight + 1 || t.top < -1) problems.push(`box spans ${Math.round(t.top)}→${Math.round(t.bottom)} outside 0→${window.innerHeight}`);
      if (ring) {
        const h = ring.getBoundingClientRect();
        const overlaps = t.left < h.right && t.right > h.left && t.top < h.bottom && t.bottom > h.top;
        // Mirror tooltipBox()'s own accounting: it spends 14px of gap plus a 12px
        // gutter before the box, and won't dock into less than 96px of box.
        const roomExisted = Math.max(h.top, window.innerHeight - h.bottom) - 26 >= 96;
        if (overlaps && roomExisted) problems.push(`box covers the highlighted element (box ${Math.round(t.top)}–${Math.round(t.bottom)}, target ${Math.round(h.top)}–${Math.round(h.bottom)})`);
      }
      return problems;
    }, vw);
    if (result === null) break;
    for (const p of result) out.push({ kind: "tutorial", detail: `step ${step + 1}: ${p}` });
    const next = page.getByRole("button", { name: /^(Next|Done)$/ });
    if (!(await next.count())) break;
    if (/Done/.test((await next.first().textContent()) ?? "")) break;
    await next.first().click();
  }
  await page.keyboard.press("Escape");
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext();
  // tsx compiles with esbuild's keepNames, which wraps named functions in a `__name`
  // helper that does not exist inside page.evaluate. Stub it in every document.
  await context.addInitScript(() => { (window as unknown as { __name: unknown }).__name = (fn: unknown) => fn; });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 20000 }), page.click('button[type="submit"]')]);

  // URLs carry the society slug unless SOCIETY_SLUG is set, in which case proxy.ts
  // rewrites them away. Land on the dashboard and read back whichever it is.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const landed = new URL(page.url()).pathname;
  const prefix = landed.startsWith("/dashboard") ? "" : `/${landed.split("/").filter(Boolean)[0]}`;
  console.log(`signed in as ${EMAIL} → ${landed} (path prefix "${prefix}")\n`);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const path of PAGES) {
      const res = await page.goto(`${BASE}${prefix}${path}`, { waitUntil: "networkidle" }).catch(() => null);
      await page.waitForTimeout(300);
      if (new URL(page.url()).pathname.endsWith("/login")) continue;
      // A 404 renders a tiny page that passes every check for the wrong reason.
      if (res && res.status() >= 400) {
        findings.push({ page: path, viewport: vp.name, kind: "not-reachable", detail: `HTTP ${res.status()}` });
        continue;
      }

      for (const f of await scanOverflow(page)) findings.push({ page: path, viewport: vp.name, ...f });
      if (vp.width <= 430) {
        for (const f of await scanTutorial(page, vp.width)) findings.push({ page: path, viewport: vp.name, ...f });
      }
      await page.screenshot({ path: join(OUT, `${vp.name}${path.replace(/\//g, "_")}.png`), fullPage: true });
    }
    console.log(`scanned ${PAGES.length} pages @ ${vp.name} (${vp.width}px)`);
  }

  await browser.close();

  console.log(`\nscreenshots: ${OUT}\n`);
  if (!findings.length) {
    console.log("no layout findings");
    return;
  }
  const byKind = new Map<string, Finding[]>();
  for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
  for (const [kind, list] of byKind) {
    console.log(`\n${kind} (${list.length})`);
    for (const f of list) console.log(`  ${f.viewport.padEnd(10)} ${f.page.padEnd(28)} ${f.detail}`);
  }
  process.exitCode = 1;
}

main();

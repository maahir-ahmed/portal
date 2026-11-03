import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { demoEnabled } from "./rubricDemo";

// Updates for a self-hosted portal. The server's `./portal tick` (every 5 minutes,
// installed by `./portal autoupdate on`) installs new releases each night and checks in
// at POST /api/system/update, which is how it learns that an executive pressed
// "Update now" in Settings. The app can't update itself: that would need the Docker
// socket, which is root on the host. So it only asks, and the server does the work.
//
// Only for stacks running a published image (APP_IMAGE=ghcr.io/...:1, set by the
// installer) with UPDATE_TOKEN set. The hosted stacks build from source and deploy from
// GitHub, so all of this stays hidden there.

const ROW = "app";
/** The tick runs every 5 minutes; three missed means it isn't running. */
const SEEN_WITHIN_MS = 15 * 60_000;

export function updatesEnabled(): boolean {
  return !demoEnabled() && !!process.env.UPDATE_TOKEN && !!parseImage(process.env.APP_IMAGE);
}

export function currentVersion(): string {
  return process.env.APP_VERSION || "source";
}

/**
 * ghcr.io/owner/repo-app:1 → { registry: "ghcr.io", repo: "owner/repo-app", tag: "1" }.
 * Null for an image with no registry host, like the hosted stacks' "rubric_prod-app".
 */
export function parseImage(image: string | undefined): { registry: string; repo: string; tag: string } | null {
  const m = image?.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?|[a-z0-9.-]+:\d+)\/([a-z0-9._/-]+):([\w.-]+)$/);
  return m ? { registry: m[1], repo: m[2], tag: m[3] } : null;
}

function semver(v: string): number[] | null {
  const m = v.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return m ? m.slice(1).map(Number) : null;
}

export function newer(a: string, b: string): boolean {
  const x = semver(a), y = semver(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/**
 * The newest release a channel tag follows: "1" follows 1.x.y, "1.4" follows 1.4.y.
 * Null for "latest" and exact versions, which don't move to a release.
 */
export function newestInChannel(tags: string[], channel: string): string | null {
  if (!/^\d+(\.\d+)?$/.test(channel)) return null;
  let best: string | null = null;
  for (const t of tags) {
    if (semver(t) && t.startsWith(channel + ".") && (!best || newer(t, best))) best = t;
  }
  return best;
}

let cached: { at: number; latest: string | null } | null = null;

/** The newest release on the image's channel, from GHCR, checked at most hourly. */
async function latestRelease(): Promise<string | null> {
  const image = parseImage(process.env.APP_IMAGE);
  // ponytail: GHCR only, which is where images.yml publishes. Another registry still
  // updates each night; it just can't say in advance that a release is out.
  if (image?.registry !== "ghcr.io") return null;
  if (cached && Date.now() - cached.at < 3_600_000) return cached.latest;
  let latest: string | null = cached?.latest ?? null;
  try {
    // Public packages still want an anonymous pull token for the registry API.
    const tok = await fetch(`https://ghcr.io/token?scope=repository:${image.repo}:pull`, {
      signal: AbortSignal.timeout(5_000),
    }).then((r) => r.json() as Promise<{ token?: string }>);
    // GHCR lists tags oldest first, 1000 a page, and every main build adds a sha- tag,
    // so the newest releases are on the last page: follow Link to it.
    const tags: string[] = [];
    let next: string | null = `/v2/${image.repo}/tags/list?n=1000`;
    for (let page = 0; next && page < 20; page++) {
      const res: Response = await fetch(new URL(next, "https://ghcr.io"), {
        headers: { Authorization: `Bearer ${tok.token ?? ""}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`GHCR tags HTTP ${res.status}`);
      tags.push(...(((await res.json()) as { tags?: string[] }).tags ?? []));
      next = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
    }
    latest = newestInChannel(tags, image.tag);
  } catch (err) {
    console.warn("Update check failed:", err instanceof Error ? err.message : err);
  }
  cached = { at: Date.now(), latest };
  return latest;
}

export interface UpdateStatus {
  enabled: boolean;
  current: string;
  latest: string | null;
  available: boolean;
  /** Whether the server's updater has checked in lately. Without it, nothing installs. */
  updaterRunning: boolean;
  requestedAt: Date | null;
  result: string | null;
  resultDetail: string | null;
  resultVersion: string | null;
  resultAt: Date | null;
}

export async function updateStatus(): Promise<UpdateStatus> {
  const current = currentVersion();
  if (!updatesEnabled()) {
    return { enabled: false, current, latest: null, available: false, updaterRunning: false, requestedAt: null, result: null, resultDetail: null, resultVersion: null, resultAt: null };
  }
  const [latest, row] = await Promise.all([latestRelease(), prisma.appUpdate.findUnique({ where: { id: ROW } })]);
  return {
    enabled: true,
    current,
    latest,
    available: !!latest && newer(latest, current),
    updaterRunning: !!row?.lastSeenAt && Date.now() - row.lastSeenAt.getTime() < SEEN_WITHIN_MS,
    requestedAt: row?.requestedAt ?? null,
    result: row?.result ?? null,
    resultDetail: row?.resultDetail ?? null,
    resultVersion: row?.resultVersion ?? null,
    resultAt: row?.resultAt ?? null,
  };
}

export async function requestUpdate(userId: string) {
  await prisma.appUpdate.upsert({
    where: { id: ROW },
    create: { id: ROW, requestedAt: new Date(), requestedById: userId },
    update: { requestedAt: new Date(), requestedById: userId },
  });
}

/** The updater checking in, with how its last update went if it hasn't said yet. */
export async function updaterCheckIn(result?: {
  result: string;
  detail?: string;
  version?: string;
}): Promise<{ requested: boolean }> {
  const now = new Date();
  const finished = result
    ? {
        result: result.result,
        resultDetail: result.detail ?? null,
        resultVersion: result.version || null,
        resultAt: now,
        requestedAt: null,
        requestedById: null,
      }
    : {};
  const row = await prisma.appUpdate.upsert({
    where: { id: ROW },
    create: { id: ROW, lastSeenAt: now, ...finished },
    update: { lastSeenAt: now, ...finished },
  });
  return { requested: !!row.requestedAt };
}

export function validUpdateToken(header: string | null): boolean {
  const expected = process.env.UPDATE_TOKEN;
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(header.slice(7)), hash(expected));
}

// Failed password checks, counted per key ("email:…", "ip:…") over a 15-minute window.
// Only failures count, so the shared demo login and members who type it right never
// notice. ponytail: in-process memory, so a restart clears it and replicas don't share
// it; move it to the database if the app ever runs more than one container.
const WINDOW = 15 * 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

export type Limit = [key: string, max: number];

/** The keys to count a password check under: the account, and where it came from. */
export function passwordLimits(email: string, headers: Headers): Limit[] {
  // nginx sets X-Real-IP from Cloudflare's or Caddy's view of the client.
  return [[`email:${email.toLowerCase()}`, 10], [`ip:${headers.get("x-real-ip") ?? "unknown"}`, 50]];
}

export function isLimited(limits: Limit[], now = Date.now()) {
  return limits.some(([key, max]) => {
    const h = hits.get(key);
    return !!h && h.resetAt > now && h.count >= max;
  });
}

export function recordFailure(limits: Limit[], now = Date.now()) {
  if (hits.size > 10_000) for (const [k, h] of hits) if (h.resetAt <= now) hits.delete(k);
  for (const [key] of limits) {
    const h = hits.get(key);
    if (!h || h.resetAt <= now) hits.set(key, { count: 1, resetAt: now + WINDOW });
    else h.count++;
  }
}

/** A right password clears the account's count (not the address's). */
export function clearFailures(limits: Limit[]) {
  hits.delete(limits[0][0]);
}

import { offline } from "@/lib/utils";

// Fetch helpers for client components (shared by Settings > Backups and Debugging).

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init).catch(offline);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { data });
  return data as T;
}

/**
 * Starts a job and waits for it. The server runs backups, restores and SQL in the
 * background (a request would hit Cloudflare's 100-second limit), so this polls. A
 * 502/503 means the maintenance page or a restart is in the way: keep waiting.
 */
export async function runJob<T>(url: string, init: RequestInit, base: string, headers: Record<string, string> = {}): Promise<T> {
  const { job } = await api<{ job: string }>(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`${base}/jobs/${job}`, { cache: "no-store", headers }).catch(() => null);
    if (!res || res.status === 502 || res.status === 503 || res.status === 504) continue;
    // Signed out by a restore that replaced the account: the reload sorts that out.
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("signed out"), { signedOut: true });
    const s = await res.json();
    if (s.state === "done") return s.result as T;
    if (s.state === "failed") throw Object.assign(new Error(s.error), { data: s.result ?? {} });
  }
}

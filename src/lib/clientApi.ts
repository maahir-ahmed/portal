import { toast } from "sonner";
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
export async function runJob<T>(
  url: string,
  init: RequestInit,
  base: string,
  headers: Record<string, string> = {},
  signal?: AbortSignal
): Promise<T> {
  const { job } = await api<{ job: string }>(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    // The page was left: stop polling.
    if (signal?.aborted) throw Object.assign(new Error("cancelled"), { aborted: true });
    const res = await fetch(`${base}/jobs/${job}`, { cache: "no-store", headers, signal }).catch(() => null);
    if (signal?.aborted) throw Object.assign(new Error("cancelled"), { aborted: true });
    if (!res || res.status === 502 || res.status === 503 || res.status === 504) continue;
    // Signed out by a restore that replaced the account: the reload sorts that out. The
    // proxy answers a signed-out poll with a redirect to the login page, so a redirected
    // or non-JSON answer counts too.
    if (res.status === 401 || res.status === 403 || res.redirected || !res.headers.get("content-type")?.includes("json")) {
      throw Object.assign(new Error("signed out"), { signedOut: true });
    }
    // A missing job (the app restarted, or the file was cleared) will never finish.
    if (res.status === 404) throw new Error("The job was lost, most likely because the portal restarted. Check Settings > Backups before trying again.");
    const s = await res.json().catch(() => null);
    if (!s) throw Object.assign(new Error("signed out"), { signedOut: true });
    if (s.state === "done") return s.result as T;
    if (s.state === "failed") throw Object.assign(new Error(s.error), { data: s.result ?? {} });
  }
}

/**
 * Copies to the clipboard and says what happened. On a plain-http address there is no
 * clipboard API at all, so the failure is a toast rather than an unhandled throw.
 */
export async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`Copied ${label}`, { duration: 1500 });
  } catch {
    toast.error("Copy failed: select and copy manually");
  }
}

/** The server's own explanation for a failed response (a reason it gives, such as "no secret key"), else the fallback. */
export async function reason(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return typeof data?.error === "string" && data.error ? data.error : fallback;
}

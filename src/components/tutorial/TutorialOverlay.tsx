"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolvePath, stepsFor, tooltipBox, type DemoIds, type TourStep } from "@/lib/tutorial";

// Guided tour. Mounted once in the society layout; started by dispatching
// `tutorial:start` on window (the header button does that). Progress lives in
// localStorage so a hard reload mid-tour resumes where you were.

const SAVE_KEY = "society-tutorial";
export const SEEN_KEY = "society-tutorial-seen";

interface Saved {
  stepId: string;
  ids: DemoIds;
}

export function TutorialOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ society: string }>();
  const { data: session } = useSession();

  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [ids, setIds] = useState<DemoIds>({});
  const [rect, setRect] = useState<DOMRect | null>(null);
  // False while the next step's target is still being measured, the box waits it
  // out rather than following the measurement around.
  const [settled, setSettled] = useState(true);
  const [busy, setBusy] = useState(false);
  const navigatedFor = useRef<string | null>(null);

  const slug = params?.society;
  const role = (
    session?.user as { memberships?: { society: { slug: string }; role: string }[] } | undefined
  )?.memberships?.find((m) => m.society.slug === slug)?.role;

  const steps = stepsFor(role);
  const step: TourStep | undefined = active ? steps[index] : undefined;

  // URLs are slug-prefixed normally, but slug-free in single-society mode.
  const slugged = !!slug && pathname.startsWith(`/${slug}`);
  const hrefFor = useCallback((p: string) => (slugged ? `/${slug}${p}` : p), [slug, slugged]);
  const atPath = useCallback(
    (p: string) => pathname === `/${slug}${p}` || pathname === p,
    [pathname, slug]
  );

  const wipeDemo = useCallback(async () => {
    if (!slug) return;
    await fetch(`/api/societies/${slug}/tutorial/demo`, { method: "DELETE" }).catch(() => {});
  }, [slug]);

  const close = useCallback(
    (cleanup: boolean) => {
      setActive(false);
      setRect(null);
      localStorage.removeItem(SAVE_KEY);
      localStorage.setItem(SEEN_KEY, "1");
      if (cleanup) {
        void wipeDemo();
        setIds({});
      }
    },
    [wipeDemo]
  );

  // Start / resume ------------------------------------------------------------
  useEffect(() => {
    function start() {
      const saved = localStorage.getItem(SAVE_KEY);
      localStorage.removeItem(SAVE_KEY);
      setIds({});
      setIndex(0);
      setActive(true);
      // A previous tour that never finished may have left demo records behind.
      if (saved) void wipeDemo();
    }
    window.addEventListener("tutorial:start", start);
    return () => window.removeEventListener("tutorial:start", start);
  }, [wipeDemo]);

  // Restores tour position from localStorage, which only exists on the client.
  useEffect(() => {
    const saved = localStorage.getItem(SAVE_KEY);
    if (!saved) return;
    try {
      const { stepId, ids: savedIds } = JSON.parse(saved) as Saved;
      const at = stepsFor(role).findIndex((s) => s.id === stepId);
      if (at >= 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only storage read on mount
        setIds(savedIds ?? {});
        setIndex(at);
        setActive(true);
      }
    } catch {
      localStorage.removeItem(SAVE_KEY);
    }
    // role arrives with the session; resume once it does
  }, [role]);

  useEffect(() => {
    if (active && step) {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ stepId: step.id, ids } satisfies Saved));
    }
  }, [active, step, ids]);

  // Navigate to the step's page ----------------------------------------------
  useEffect(() => {
    if (!step) return;
    const p = resolvePath(step, ids);
    if (!p || atPath(p)) return;
    if (navigatedFor.current === step.id) return; // don't fight a redirect
    navigatedFor.current = step.id;
    router.push(hrefFor(p));
  }, [step, ids, atPath, hrefFor, router]);

  // Track the highlighted element -------------------------------------------
  // Nothing is committed to state until the target has stopped moving (two frames
  // agreeing), so the highlight tweens once, straight from the previous box to the
  // final one. Committing early is what made it look like it was resizing itself:
  // the rect was measured while the page was still navigating and smooth-scrolling.
  useEffect(() => {
    if (!step) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gates rendering on a DOM measurement that hasn't been taken yet
    setSettled(false);
    if (!step.target) {
      setRect(null);
      setSettled(true);
      return;
    }
    // Open the tab/panel this step is about, if it isn't already.
    if (step.click) {
      (document.querySelector(`[data-tour="${step.click}"]`) as HTMLElement | null)?.click();
    }

    const same = (a: DOMRect | null, b: DOMRect) =>
      !!a && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

    let frame = 0;
    let poll = 0;
    let scrolled = false;
    let previous: DOMRect | null = null;
    let agreed = 0;
    const deadline = performance.now() + 2500; // long enough to cover a page change

    const settle = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el) {
        // Give it up to the deadline to render, then fall back to the centred box.
        if (performance.now() > deadline) {
          setRect(null);
          setSettled(true);
          return;
        }
        frame = requestAnimationFrame(settle);
        return;
      }
      if (!scrolled) {
        scrolled = true;
        // Instant, not smooth: a smooth scroll keeps changing the rect for ~400ms.
        el.scrollIntoView({ block: "center", behavior: "instant" });
      }
      const r = el.getBoundingClientRect();
      agreed = same(previous, r) ? agreed + 1 : 0;
      previous = r;
      if (agreed < 2 && performance.now() < deadline) {
        frame = requestAnimationFrame(settle);
        return;
      }
      setRect(r);
      setSettled(true);
      // Then stay glued to it as the page changes: scrolling, images loading, panels opening.
      poll = window.setInterval(() => {
        const live = document.querySelector(`[data-tour="${step.target}"]`);
        if (!live) return;
        const next = live.getBoundingClientRect();
        setRect((prev) => (same(prev, next) ? prev : next));
      }, 250);
    };
    settle();

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(poll);
    };
  }, [step, pathname]);

  // Controls -----------------------------------------------------------------
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const next = useCallback(async () => {
    if (!step) return;
    if (step.kind === "welcome" && slug) {
      setBusy(true);
      const res = await fetch(`/api/societies/${slug}/tutorial/demo`, { method: "POST" }).catch(() => null);
      setBusy(false);
      if (res?.ok) setIds(await res.json());
      else toast.error("Couldn't create the demo records. The tour still works, some pages will just be empty.");
    }
    if (step.kind === "cleanup") {
      setBusy(true);
      await wipeDemo();
      setBusy(false);
      close(false);
      toast.success("Tour finished, demo records deleted");
      return;
    }
    setIndex((i) => Math.min(steps.length - 1, i + 1));
  }, [step, slug, steps.length, wipeDemo, close]);

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(true);
      else if (e.key === "ArrowRight") void next();
      else if (e.key === "ArrowLeft") back();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, back, close]);

  if (!active || !step) return null;

  const last = step.kind === "cleanup";

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* Dim everything except the highlighted element (one box-shadow, no cut-outs). */}
      {rect ? (
        <div
          className="absolute rounded-xl transition-[top,left,width,height] duration-300 ease-out"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(9,9,11,0.55)",
            outline: "2px solid hsl(var(--brand-deep))",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-zinc-950/55" />
      )}

      {/* Fades in at its final position, so it never appears mid-measurement. */}
      <div
        className={cn(
          "absolute overflow-y-auto rounded-xl border border-border bg-card shadow-2xl transition-opacity duration-150",
          settled ? "pointer-events-auto opacity-100" : "opacity-0"
        )}
        style={{ ...tooltipBox(rect, window.innerWidth, window.innerHeight) }}
      >
        <div className="flex items-start gap-2 px-4 pt-3.5">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Step {index + 1} of {steps.length}
            </p>
            <h2 className="mt-1 text-[15px] font-semibold leading-snug">{step.title}</h2>
          </div>
          <button
            onClick={() => close(true)}
            title="Leave the tour (deletes the demo records)"
            className="-mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="whitespace-pre-line px-4 pt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

        {!rect && step.target && (
          <p className="mx-4 mt-3 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
            Nothing to point at on this page right now; it only appears when there is something in that state.
          </p>
        )}

        <div className="mt-3 h-1 bg-muted">
          <div
            className="h-full bg-[hsl(var(--brand-deep))] transition-all"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={back}
              disabled={index === 0}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            {step.kind === "welcome" && (
              <button
                onClick={() => setIndex(1)}
                className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Skip demo records
              </button>
            )}
          </div>
          <button
            onClick={() => void next()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {step.kind === "welcome" ? "Create demo records & start" : last ? "Finish & clean up" : "Next"}
            {!last && step.kind !== "welcome" && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

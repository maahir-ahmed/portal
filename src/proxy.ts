import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { apiEnabled, pageEnabled } from "@/lib/modules";
import { modulesForSlug } from "@/lib/modulesServer";

// Single-society mode: set SOCIETY_SLUG env var for per-domain deployments.
// Middleware rewrites clean paths (/dashboard) → /slug/dashboard internally,
// and redirects /slug/... → /... so users always see slug-free public URLs.
const SOCIETY_SLUG = process.env.SOCIETY_SLUG ?? "";

// Paths that are never rewritten (they exist at the root level)
const ROOT_PATHS = ["/login", "/setup", "/api/", "/_next", "/uploads", "/favicon.ico"];

function isRootPath(pathname: string) {
  return ROOT_PATHS.some((p) => pathname.startsWith(p));
}

// Splits a request into the society it is for and the path inside it, so a switched
// off feature module can be refused here, once, for its pages and its API alike.
function societyPath(pathname: string): { slug: string; sub: string; api: boolean } | null {
  const api = pathname.match(/^\/api\/societies\/([^/]+)(\/.*)?$/);
  if (api) return { slug: api[1], sub: api[2] ?? "/", api: true };
  if (isRootPath(pathname) || pathname === "/") return null;
  if (SOCIETY_SLUG) {
    const prefix = `/${SOCIETY_SLUG}`;
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return { slug: SOCIETY_SLUG, sub: pathname.slice(prefix.length) || "/", api: false };
    }
    return { slug: SOCIETY_SLUG, sub: pathname, api: false };
  }
  const [, slug, ...rest] = pathname.split("/");
  return { slug, sub: "/" + rest.join("/"), api: false };
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isAuth = !!req.auth;

  // Login is the only unauthenticated page. There is no self-registration: an
  // account only exists because an executive created it from the Members tab.
  const isAuthPage = pathname.startsWith("/login");
  const isApiAuth = pathname.startsWith("/api/auth");
  const isPublic =
    isAuthPage || isApiAuth || pathname.startsWith("/_next") || pathname.startsWith("/uploads");

  // Auth guard (runs regardless of society mode)
  if (!isPublic && !isAuth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Feature modules. A page of a switched-off module is a 404, as if it never existed;
  // its API answers 403 with a reason, for the client that still has the page open.
  const target = isAuth ? societyPath(pathname) : null;
  if (target) {
    const flags = await modulesForSlug(target.slug);
    if (target.api && !apiEnabled(flags, target.sub)) {
      return NextResponse.json({ error: "This feature is switched off in Settings" }, { status: 403 });
    }
    if (!target.api && !pageEnabled(flags, target.sub)) {
      return NextResponse.rewrite(new URL(`/${target.slug}/feature-off`, req.url));
    }
  }

  // Single-society mode URL rewriting
  if (SOCIETY_SLUG && !isPublic) {
    const slugPrefix = `/${SOCIETY_SLUG}`;

    // Already slug-prefixed: either a real /slug/... request OR the internal rewrite
    // re-entering middleware (which happens in the standalone production server). Render
    // as-is. Do NOT redirect to a clean URL here: combined with the rewrite below it
    // creates an infinite /dashboard ⇄ /slug/dashboard loop.
    if (pathname === slugPrefix || pathname.startsWith(slugPrefix + "/")) {
      return NextResponse.next();
    }

    if (!isRootPath(pathname) && pathname !== "/") {
      // Rewrite clean path → /slug/path (internal, transparent to browser)
      const rewritten = new URL(`${slugPrefix}${pathname}`, req.url);
      rewritten.search = req.nextUrl.search;
      return NextResponse.rewrite(rewritten);
    }
    // Bare "/" falls through to app/page.tsx, which redirects to /dashboard.
  }

  return NextResponse.next();
});

export const config = {
  // Skip Next internals and static files in /public (so the auth guard doesn't
  // redirect e.g. /secsoc-logo.png to /login).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)).*)"],
};

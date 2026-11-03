import { auth } from "@/lib/auth";
import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { apiEnabled, pageEnabled } from "@/lib/modules";
import { modulesForSlug } from "@/lib/modulesServer";
import { maintenanceActive, maintenancePage } from "@/lib/maintenance";

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

// Rewrites must target this server's own origin, as Next sees it (in the container,
// http://0.0.0.0:3000), or Next treats them as a different site and fetches them over
// the network. NextAuth's auth() hands the callback a request rebuilt on NEXTAUTH_URL,
// the public address, so the real origin is taken here, before it does. Built on
// req.url, every slug-free page went out to the public URL and back in through the
// tunnel, and failed outright where the box cannot reach its own public address.
export default function proxy(req: NextRequest, ev: NextFetchEvent) {
  const origin = req.nextUrl.origin;
  // auth()'s overloads return a union; with a callback it is this middleware.
  return (auth((r) => route(r, origin)) as unknown as NextMiddleware)(req, ev);
}

async function route(req: NextAuthRequest, origin: string) {
  // A restore is replacing the database (Settings > Debugging): nobody gets a page
  // built from half of it. 503 with Retry-After, as nginx answers while the app restarts.
  if (maintenanceActive()) {
    return new NextResponse(maintenancePage(), {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "20", "Cache-Control": "no-store" },
    });
  }

  const { pathname } = req.nextUrl;
  const isAuth = !!req.auth;

  // Login is the only unauthenticated page, besides first-run setup. There is no
  // self-registration: an account only exists because an executive created it from
  // the Members tab, or is the first one, made with the installer's setup token.
  const isAuthPage = pathname.startsWith("/login");
  const isApiAuth = pathname.startsWith("/api/auth");
  // /setup checks for itself: on a fresh stack it is open to whoever holds the setup
  // token (src/lib/setup.ts), and from then on it sends anyone signed out to log in.
  const isSetup = pathname === "/setup" || pathname === "/api/setup";
  // Discord's calls for the /print command: signed by Discord, checked in the route.
  const isDiscord = pathname === "/api/discord/interactions";
  const isPublic =
    isAuthPage || isApiAuth || isSetup || isDiscord || pathname.startsWith("/_next") || pathname.startsWith("/uploads");

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
      return NextResponse.rewrite(new URL(`/${target.slug}/feature-off`, origin));
    }
  }

  // Single-society mode URL rewriting
  if (SOCIETY_SLUG && !isPublic) {
    const slugPrefix = `/${SOCIETY_SLUG}`;

    // Already slug-prefixed: a real /slug/... request (the app's own links use them),
    // or a rewrite coming back through here, which is what happened while rewrites
    // went out over the network (see proxy() above). Render as-is. Do NOT redirect to
    // a clean URL here: combined with the rewrite below it creates an infinite
    // /dashboard ⇄ /slug/dashboard loop.
    if (pathname === slugPrefix || pathname.startsWith(slugPrefix + "/")) {
      return NextResponse.next();
    }

    if (!isRootPath(pathname) && pathname !== "/") {
      // Rewrite clean path → /slug/path (internal, transparent to browser)
      const rewritten = new URL(`${slugPrefix}${pathname}`, origin);
      rewritten.search = req.nextUrl.search;
      return NextResponse.rewrite(rewritten);
    }
    // Bare "/" falls through to app/page.tsx, which redirects to /dashboard.
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static files in /public (so the auth guard doesn't
  // redirect e.g. /secsoc-logo.png to /login).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)).*)"],
};

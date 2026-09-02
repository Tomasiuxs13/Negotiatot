import { NextResponse, type NextRequest } from "next/server";
import {
  authRequired,
  configuredPassword,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/session";

/**
 * The gate. Everything the manager sees requires a session; everything a creator or a
 * script legitimately reaches does not.
 *
 * This replaces the HTTP basic auth that Traefik was holding in front of the app, and it
 * has to be at least as strict, because the moment it ships the proxy password comes off.
 * So it is default-deny: a path is reachable without a session only if it appears below.
 *
 * In Next 16 this file is `proxy.ts`, not `middleware.ts`, and it runs on the Node
 * runtime by default (see node_modules/next/dist/docs/.../16-proxy.md).
 */

/** Opened deliberately, each for a reason that would break if it were closed. */
const PUBLIC_PREFIXES = [
  "/login",
  // Creators open these with a token in the URL; they have no account and never will.
  "/ship",
  "/portal",
  // Google redirects a browser here after consent, with no cookie and no header of ours.
  // It validates its own OAuth state.
  "/api/integrations/gmail/callback",
  // Same reason, for the same kind of consent redirect. It validates its own OAuth state.
  "/api/integrations/docusign/callback",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const password = configuredPassword();
  if (!password) {
    // Fail closed in production: an unset password must never mean an open app.
    if (!authRequired()) return NextResponse.next();
    if (isPublicPath(pathname)) return NextResponse.next();
    return new NextResponse(
      "Counterpart has no password configured. Set COUNTERPART_PASSWORD and restart.",
      { status: 503, headers: { "content-type": "text/plain" } }
    );
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  const session = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
    password
  );
  if (session) return NextResponse.next();

  /**
   * A machine call carrying credentials of its own goes to the route, which checks them.
   * Presence is not acceptance: every /api route validates the key itself, and this only
   * decides whether the request is a browser that should be sent to the login page.
   * Without this, the extension and the bulk endpoints would be locked out by a gate
   * meant for people.
   */
  const carriesApiCredentials =
    Boolean(request.headers.get("authorization")) || Boolean(request.headers.get("x-api-key"));
  if (pathname.startsWith("/api/") && carriesApiCredentials) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in, or send an API key." }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  // Come back to where you were headed, not to the dashboard.
  if (pathname !== "/") login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  /**
   * Everything except Next's own assets. The gate must see page requests, RSC payloads
   * and server-action POSTs alike — they are all how the app is read.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

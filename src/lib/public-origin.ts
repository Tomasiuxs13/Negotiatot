interface RequestOriginInput {
  url: string;
  headers: { get(name: string): string | null };
}

/**
 * Resolve the browser-facing origin behind a reverse proxy. A configured callback URL
 * is the strongest source because it cannot be changed by an incoming Host header.
 */
export function publicRequestOrigin(
  request: RequestOriginInput,
  configuredUrl?: string | null
): string {
  if (configuredUrl?.trim()) {
    try {
      return new URL(configuredUrl.trim()).origin;
    } catch {
      // Fall through to proxy/request metadata so a bad optional value still gets a useful error.
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost && (forwardedProto === "http" || forwardedProto === "https")) {
    try {
      return new URL(`${forwardedProto}://${forwardedHost}`).origin;
    } catch {
      // Fall back to the framework-provided URL.
    }
  }
  return new URL(request.url).origin;
}

/**
 * The same resolution from headers alone, for a server action — which has no request URL
 * to fall back on. `host` is the last resort and is trusted no further than the proxy
 * config above it.
 */
export function publicOriginFromHeaders(
  headers: { get(name: string): string | null },
  configuredUrl?: string | null
): string {
  if (configuredUrl?.trim()) {
    try {
      return new URL(configuredUrl.trim()).origin;
    } catch {
      /* fall through */
    }
  }
  const host =
    headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host")?.trim();
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (host?.startsWith("localhost") ? "http" : "https");
  if (!host) throw new Error("Cannot determine this app's public address.");
  return new URL(`${proto}://${host}`).origin;
}

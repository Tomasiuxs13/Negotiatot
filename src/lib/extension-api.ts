import "server-only";

import { checkApiKey } from "./api-auth";
import { getSetting } from "./db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
};

export function extensionJson(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init.headers ?? {}) },
  });
}

export function extensionPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** API-key auth keeps the extension independent of Gmail/Workspace OAuth. */
export function extensionAuthError(request: Request): Response | null {
  const auth = checkApiKey(
    request.headers.get("authorization"),
    request.headers.get("x-api-key"),
    getSetting<string>("api_key")
  );
  return auth.ok ? null : extensionJson({ error: auth.reason }, { status: auth.status });
}

export async function extensionRequestBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 100_000) {
    throw new Error("Request is too large.");
  }
  return request.json();
}

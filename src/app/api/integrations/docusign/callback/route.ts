import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { completeDocusignAuthorization } from "@/lib/docusign";
import { publicRequestOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameState(left: string | undefined, right: string | null): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const appOrigin = publicRequestOrigin(request, process.env.DOCUSIGN_REDIRECT_URI);
  const redirect = new URL("/settings", appOrigin);
  const storedState = request.cookies.get("counterpart_docusign_oauth_state")?.value;
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");

  if (error || !sameState(storedState, state) || !code) {
    redirect.searchParams.set("docusign", error ? "denied" : "invalid-state");
  } else {
    try {
      await completeDocusignAuthorization(appOrigin, code);
      redirect.searchParams.set("docusign", "connected");
    } catch {
      redirect.searchParams.set("docusign", "connection-failed");
    }
  }
  const response = NextResponse.redirect(redirect);
  response.cookies.set("counterpart_docusign_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(appOrigin).protocol === "https:",
    path: "/api/integrations/docusign",
    maxAge: 0,
  });
  return response;
}

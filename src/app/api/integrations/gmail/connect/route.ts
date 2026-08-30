import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { gmailAuthorizationUrl } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts a user-owned OAuth flow; the app never sees a Gmail password. */
export async function GET(request: NextRequest) {
  try {
    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(gmailAuthorizationUrl(request.nextUrl.origin, state));
    response.cookies.set("counterpart_gmail_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/api/integrations/gmail",
      maxAge: 10 * 60,
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/settings?gmail=not-configured", request.url));
  }
}

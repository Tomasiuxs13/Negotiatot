import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { gmailAuthorizationUrl } from "@/lib/gmail";
import { publicRequestOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts a user-owned OAuth flow; the app never sees a Gmail password. */
export async function GET(request: NextRequest) {
  const appOrigin = publicRequestOrigin(request, process.env.GMAIL_REDIRECT_URI);
  try {
    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(gmailAuthorizationUrl(appOrigin, state));
    response.cookies.set("counterpart_gmail_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(appOrigin).protocol === "https:",
      path: "/api/integrations/gmail",
      maxAge: 10 * 60,
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/settings?gmail=not-configured", appOrigin));
  }
}

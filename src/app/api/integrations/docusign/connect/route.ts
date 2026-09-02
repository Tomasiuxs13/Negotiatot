import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { docusignAuthorizationUrl } from "@/lib/docusign";
import { publicRequestOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts a user-owned OAuth flow; the app never sees a DocuSign password. */
export async function GET(request: NextRequest) {
  const appOrigin = publicRequestOrigin(request, process.env.DOCUSIGN_REDIRECT_URI);
  try {
    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(docusignAuthorizationUrl(appOrigin, state));
    response.cookies.set("counterpart_docusign_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(appOrigin).protocol === "https:",
      path: "/api/integrations/docusign",
      maxAge: 10 * 60,
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/settings?docusign=not-configured", appOrigin));
  }
}

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { completeGmailAuthorization } from "@/lib/gmail";
import { gmailOAuthStatusForError } from "@/lib/gmail-oauth-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameState(left: string | undefined, right: string | null): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const redirect = new URL("/settings", request.url);
  const storedState = request.cookies.get("counterpart_gmail_oauth_state")?.value;
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");

  if (error || !sameState(storedState, state) || !code) {
    redirect.searchParams.set(
      "gmail",
      error ? gmailOAuthStatusForError(error) : "invalid-state",
    );
  } else {
    try {
      await completeGmailAuthorization(request.nextUrl.origin, code);
      redirect.searchParams.set("gmail", "connected");
    } catch {
      redirect.searchParams.set("gmail", "connection-failed");
    }
  }
  const response = NextResponse.redirect(redirect);
  response.cookies.set("counterpart_gmail_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/api/integrations/gmail",
    maxAge: 0,
  });
  return response;
}

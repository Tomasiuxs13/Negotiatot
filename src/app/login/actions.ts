"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  configuredPassword,
  createSessionToken,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
} from "@/lib/session";

/**
 * Sign in. One password, one cookie, thirty days.
 *
 * The cookie is httpOnly so no script can read it, sameSite=lax so it survives a normal
 * navigation but not a cross-site POST, and secure in production. It is deliberately
 * persistent: the whole point of replacing basic auth is that a deploy, a container
 * restart or closing the browser no longer costs you a login.
 */
export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const expected = configuredPassword();
  if (!expected) {
    return { error: "No password is configured on this instance." };
  }
  const submitted = String(formData.get("password") ?? "");
  if (!submitted) return { error: "Enter the password." };
  if (!(await passwordMatches(submitted, expected))) {
    // Deliberately not "wrong password for that user" — there is one door and one key.
    return { error: "That password is not right." };
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });

  const next = String(formData.get("next") ?? "");
  // Only a path from this app: an open redirect turns a login page into a phishing tool.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

import { createHash, timingSafeEqual } from "crypto";
import {
  extensionAuthError,
  extensionJson,
  extensionPreflight,
} from "@/lib/extension-api";
import { syncGmailAutomation } from "@/lib/gmail";

function gmailSyncAuthError(request: Request): Response | null {
  const expected = process.env.GMAIL_SYNC_SECRET?.trim();
  const provided = request.headers.get("x-counterpart-sync-secret")?.trim();
  if (expected && provided) {
    const expectedHash = createHash("sha256").update(expected).digest();
    const providedHash = createHash("sha256").update(provided).digest();
    if (timingSafeEqual(expectedHash, providedHash)) return null;
  }
  return extensionAuthError(request);
}

export function OPTIONS() {
  return extensionPreflight();
}

/** Chrome's background alarm calls this while both Chrome and Counterpart are running. */
export async function POST(request: Request) {
  const authError = gmailSyncAuthError(request);
  if (authError) return authError;
  try {
    return extensionJson({ ok: true, ...(await syncGmailAutomation(new URL(request.url).origin)) });
  } catch (error) {
    return extensionJson(
      { error: error instanceof Error ? error.message : "Automatic Gmail sync failed." },
      { status: 409 }
    );
  }
}

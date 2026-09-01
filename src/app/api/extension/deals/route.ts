import {
  extensionAuthError,
  extensionJson,
  extensionPreflight,
  extensionRequestBody,
} from "@/lib/extension-api";
import { gmailExtensionDealOptions } from "@/lib/gmail-extension";

export function OPTIONS() {
  return extensionPreflight();
}

export async function POST(request: Request) {
  const authError = extensionAuthError(request);
  if (authError) return authError;

  let body: unknown = {};
  try {
    body = await extensionRequestBody(request);
  } catch {
    return extensionJson({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return extensionJson({ error: "Body must be a JSON object." }, { status: 400 });
  }
  const query = (body as { query?: unknown }).query;
  return extensionJson({ deals: gmailExtensionDealOptions(query) });
}

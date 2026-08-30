import {
  extensionAuthError,
  extensionJson,
  extensionPreflight,
} from "@/lib/extension-api";

export function OPTIONS() {
  return extensionPreflight();
}

export async function GET(request: Request) {
  const authError = extensionAuthError(request);
  if (authError) return authError;
  return extensionJson({ ok: true, product: "Counterpart", extensionApi: 1 });
}

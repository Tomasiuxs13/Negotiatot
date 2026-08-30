export type GmailOAuthStatus =
  | "connected"
  | "admin-required"
  | "declined"
  | "invalid-state"
  | "connection-failed"
  | "not-configured";

export interface GmailOAuthNotice {
  tone: "success" | "warning" | "error";
  title: string;
  detail: string;
}

const STATUSES = new Set<GmailOAuthStatus>([
  "connected",
  "admin-required",
  "declined",
  "invalid-state",
  "connection-failed",
  "not-configured",
]);

export function gmailOAuthStatus(value: string | string[] | undefined): GmailOAuthStatus | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && STATUSES.has(candidate as GmailOAuthStatus)
    ? (candidate as GmailOAuthStatus)
    : null;
}

export function gmailOAuthStatusForError(error: string): GmailOAuthStatus {
  return error === "admin_policy_enforced" ? "admin-required" : "declined";
}

export function gmailOAuthNotice(status: GmailOAuthStatus | null): GmailOAuthNotice | null {
  switch (status) {
    case "connected":
      return {
        tone: "success",
        title: "Gmail access approved without administrator help",
        detail: "Google granted read-only mailbox access and Counterpart saved the encrypted connection.",
      };
    case "admin-required":
      return {
        tone: "warning",
        title: "Your Workspace administrator must approve this app",
        detail: "Counterpart did not save a Gmail connection. The Chrome-only workflow remains available.",
      };
    case "declined":
      return {
        tone: "warning",
        title: "Gmail access was not approved",
        detail: "No mailbox connection was saved. You can run the permission check again whenever you are ready.",
      };
    case "invalid-state":
      return {
        tone: "error",
        title: "The Gmail permission check expired",
        detail: "Start the check again from Settings so Counterpart can validate the Google response.",
      };
    case "connection-failed":
      return {
        tone: "error",
        title: "Google approved access, but the connection could not be completed",
        detail: "Check the OAuth client and redirect URI, then run the permission check again.",
      };
    case "not-configured":
      return {
        tone: "error",
        title: "The Gmail permission check is not configured yet",
        detail: "Add the Google OAuth client values shown below, restart Counterpart, and try again.",
      };
    default:
      return null;
  }
}

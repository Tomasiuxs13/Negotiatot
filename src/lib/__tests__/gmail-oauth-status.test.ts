import { describe, expect, it } from "vitest";
import {
  gmailOAuthNotice,
  gmailOAuthStatus,
  gmailOAuthStatusForError,
} from "../gmail-oauth-status";

describe("Gmail OAuth status", () => {
  it("distinguishes a Workspace policy block from a user decline", () => {
    expect(gmailOAuthStatusForError("admin_policy_enforced")).toBe("admin-required");
    expect(gmailOAuthStatusForError("access_denied")).toBe("declined");
  });

  it("accepts only known callback statuses", () => {
    expect(gmailOAuthStatus("connected")).toBe("connected");
    expect(gmailOAuthStatus(["admin-required", "declined"])).toBe("admin-required");
    expect(gmailOAuthStatus("anything-else")).toBeNull();
  });

  it("explains a successful permission check explicitly", () => {
    expect(gmailOAuthNotice("connected")).toMatchObject({
      tone: "success",
      title: expect.stringContaining("without administrator"),
    });
  });
});

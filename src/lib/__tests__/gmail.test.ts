import { describe, expect, it } from "vitest";
import { gmailAddresses, gmailMessageText, gmailSender } from "../gmail-parser";

describe("Gmail message parsing", () => {
  it("normalises a sender address while retaining a useful display name", () => {
    expect(gmailSender('"Mila Creator" <MILA@Agency.Example>')).toEqual({
      email: "mila@agency.example",
      name: "Mila Creator",
    });
    expect(gmailSender("not an address")).toEqual({ email: null, name: "not an address" });
  });

  it("prefers text/plain and falls back to a readable HTML message", () => {
    expect(
      gmailMessageText({
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/html", body: { data: Buffer.from("<p>Hello <b>there</b></p>").toString("base64url") } },
          { mimeType: "text/plain", body: { data: Buffer.from("Hello there").toString("base64url") } },
        ],
      })
    ).toBe("Hello there");
    expect(
      gmailMessageText({
        mimeType: "text/html",
        body: { data: Buffer.from("<p>Thanks<br>Let’s talk.</p>").toString("base64url") },
      })
    ).toBe("Thanks\nLet’s talk.");
  });

  it("extracts every unique recipient from a Gmail address header", () => {
    expect(
      gmailAddresses('"Mila, Creator" <MILA@Agency.Example>, team@getryoko.com, <mila@agency.example>')
    ).toEqual(["mila@agency.example", "team@getryoko.com"]);
  });
});

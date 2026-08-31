import { describe, expect, it } from "vitest";
import { splitQuotedReply } from "../message-quote";

describe("splitQuotedReply", () => {
  it("leaves a message with no quoted chain alone", () => {
    const body = "Hi Thomas,\n\nSounds good — my rate is $900.\n\nBest,\nMarta";
    expect(splitQuotedReply(body)).toEqual({ latest: body, quoted: null, quotedLines: 0 });
  });

  it("separates the reply from the chain it quotes — the reported 26-line wall", () => {
    const body = [
      "Just floating this back to the top of your inbox.",
      "",
      "Thomas",
      "",
      "On Mon, Aug 24, 2026 at 12:14 PM Thomas Ryoko <thomas@getryoko.com> wrote:",
      "> Hi Livin' Our Vision,",
      ">",
      "> I'm Thomas, I run influencer partnerships at Ryoko.",
    ].join("\n");
    const split = splitQuotedReply(body);
    expect(split.latest).toBe("Just floating this back to the top of your inbox.\n\nThomas");
    expect(split.quoted?.startsWith("On Mon, Aug 24")).toBe(true);
    expect(split.quotedLines).toBe(4);
  });

  it("takes the attribution with the quote even when a blank line separates them", () => {
    const split = splitQuotedReply("New text\n\nFrom: thomas@getryoko.com\n\n> old text");
    expect(split.latest).toBe("New text");
    expect(split.quoted).toContain("From: thomas@getryoko.com");
  });

  it("keeps a quote that has no attribution above it", () => {
    const split = splitQuotedReply("Sure.\n> what about the rate?");
    expect(split.latest).toBe("Sure.");
    expect(split.quoted).toBe("> what about the rate?");
  });

  it("never hides everything — a forward with no new text keeps its body", () => {
    const split = splitQuotedReply("> Hi,\n> are you interested?");
    expect(split.latest).toBe("> Hi,\n> are you interested?");
    expect(split.quoted).toBeNull();
  });

  it("does not mistake a sentence containing 'on' for an attribution", () => {
    const split = splitQuotedReply("We agreed on the price.\n> earlier note");
    expect(split.latest).toBe("We agreed on the price.");
  });
});

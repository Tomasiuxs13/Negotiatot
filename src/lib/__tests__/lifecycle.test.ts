import { describe, expect, it } from "vitest";
import {
  canAdvanceContent,
  canCompleteDeal,
  canLeaveWonStage,
  canManageFulfillment,
  isHttpUrl,
} from "../lifecycle";

describe("fulfillment lifecycle", () => {
  it("starts work only after agreement and locks completed work", () => {
    expect(canManageFulfillment("analyzing").ok).toBe(false);
    expect(canManageFulfillment("agreed").ok).toBe(true);
    expect(canManageFulfillment("completed").ok).toBe(false);
  });

  it("requires all tracked work to finish before completion", () => {
    expect(
      canCompleteDeal({
        currentStage: "agreed",
        content: [{ status: "posted" }],
        payments: [{ status: "paid" }],
        shipments: [{ status: "delivered" }],
      }).reason
    ).toContain("not verified");

    expect(
      canCompleteDeal({
        currentStage: "agreed",
        content: [{ status: "verified" }],
        payments: [{ status: "paid" }],
        shipments: [{ status: "delivered" }],
      }).ok
    ).toBe(true);
  });

  it("does not complete an empty deal", () => {
    expect(
      canCompleteDeal({ currentStage: "agreed", content: [], payments: [], shipments: [] }).ok
    ).toBe(false);
  });

  it("protects a won deal that already has operational records", () => {
    expect(
      canLeaveWonStage({
        currentStage: "agreed",
        nextStage: "declined",
        hasConfirmedContract: false,
        contentCount: 1,
        paymentCount: 0,
        shipmentCount: 0,
      }).ok
    ).toBe(false);
  });
});

describe("content lifecycle", () => {
  it("is forward-only and reserves review steps for their specialist actions", () => {
    expect(canAdvanceContent("planned", "in_production").ok).toBe(true);
    expect(canAdvanceContent("planned", "posted").ok).toBe(false);
    expect(canAdvanceContent("in_production", "submitted").ok).toBe(false);
    expect(canAdvanceContent("submitted", "approved").ok).toBe(false);
    expect(canAdvanceContent("approved", "posted").ok).toBe(true);
  });

  it("accepts only bounded http(s) evidence links", () => {
    expect(isHttpUrl("https://example.com/video")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("not a link")).toBe(false);
  });
});

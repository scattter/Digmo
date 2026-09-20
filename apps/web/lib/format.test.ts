import { describe, expect, it } from "vitest";
import { formatEstimateTime } from "./format";

describe("formatEstimateTime", () => {
  it("marks an earlier Shanghai date as the latest quote across UTC midnight boundaries", () => {
    const now = new Date("2026-03-18T16:01:00Z");
    expect(formatEstimateTime("2026-03-18T15:59:00Z", now)).toMatch(/^最近行情 /);
    expect(formatEstimateTime("2026-03-18T16:00:00Z", now)).toMatch(/^行情时间 /);
  });

  it("does not manufacture a time for missing or invalid data", () => {
    expect(formatEstimateTime(undefined)).toBe("");
    expect(formatEstimateTime("invalid")).toBe("");
  });
});

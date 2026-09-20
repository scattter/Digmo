import { describe, expect, test } from "vitest";
import { getNextWorkingDaySettlementTime, isSameShanghaiDay } from "../time.js";

describe("time utils", () => {
  test("compares calendar days at Shanghai midnight and rejects unavailable times", () => {
    const now = new Date("2026-03-17T16:00:00.000Z");
    expect(isSameShanghaiDay("2026-03-18T00:00:00+08:00", now)).toBe(true);
    expect(isSameShanghaiDay("2026-03-17T15:59:59.000Z", now)).toBe(false);
    expect(isSameShanghaiDay("invalid", now)).toBe(false);
    expect(isSameShanghaiDay(undefined, now)).toBe(false);
  });
  test("computes next working day settlement time for a weekday afternoon", () => {
    const input = new Date("2026-03-23T07:20:00.000Z");

    expect(getNextWorkingDaySettlementTime(input).toISOString()).toBe("2026-03-24T01:00:00.000Z");
  });

  test("computes next working day settlement time across a weekend", () => {
    const input = new Date("2026-03-20T07:20:00.000Z");

    expect(getNextWorkingDaySettlementTime(input).toISOString()).toBe("2026-03-23T01:00:00.000Z");
  });

  test("computes next working day settlement time when submitted on saturday", () => {
    const input = new Date("2026-03-21T04:00:00.000Z");

    expect(getNextWorkingDaySettlementTime(input).toISOString()).toBe("2026-03-23T01:00:00.000Z");
  });
});

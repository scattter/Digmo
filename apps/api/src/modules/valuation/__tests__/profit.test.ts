import { describe, expect, test } from "vitest";
import { calcDailyProfitAmount, calcDailyProfitPct } from "../profit.js";

describe("daily profit", () => {
  test("uses holding amount as the base for both positive and negative returns", () => {
    expect(calcDailyProfitAmount(10_000, 0.01)).toBe(100);
    expect(calcDailyProfitAmount(10_000, -0.01)).toBe(-100);
    expect(calcDailyProfitAmount(10_000, -0)).toBe(0);
    expect(calcDailyProfitPct(100, 10_000)).toBe(0.01);
    expect(calcDailyProfitPct(0, 0)).toBe(0);
  });

  test("sums amounts after each fund is rounded to cents", () => {
    const amount = calcDailyProfitAmount(0.49, 0.01) + calcDailyProfitAmount(0.49, 0.01);
    expect(amount).toBe(0);
    expect(calcDailyProfitPct(amount, 0.98)).toBe(0);
  });
});

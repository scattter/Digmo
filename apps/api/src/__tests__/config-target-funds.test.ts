import { afterEach, describe, expect, test } from "vitest";
import { getConfig } from "../config.js";

const ORIGINAL_VALUATION_TARGET_FUNDS = process.env.VALUATION_TARGET_FUNDS;

afterEach(() => {
  if (ORIGINAL_VALUATION_TARGET_FUNDS === undefined) {
    delete process.env.VALUATION_TARGET_FUNDS;
    return;
  }
  process.env.VALUATION_TARGET_FUNDS = ORIGINAL_VALUATION_TARGET_FUNDS;
});

describe("getConfig targetFunds", () => {
  test("defaults to empty list when VALUATION_TARGET_FUNDS is not set", () => {
    delete process.env.VALUATION_TARGET_FUNDS;

    const config = getConfig();

    expect(config.targetFunds).toEqual([]);
  });

  test("parses comma-separated VALUATION_TARGET_FUNDS", () => {
    process.env.VALUATION_TARGET_FUNDS = "161725, 110011, ,006327";

    const config = getConfig();

    expect(config.targetFunds).toEqual(["161725", "110011", "006327"]);
  });
});

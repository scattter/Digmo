import { afterEach, describe, expect, test } from "vitest";
import { getConfig } from "../config.js";

const ORIGINAL_VALUATION_TARGET_FUNDS = process.env.VALUATION_TARGET_FUNDS;
const ORIGINAL_OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;

afterEach(() => {
  if (ORIGINAL_VALUATION_TARGET_FUNDS === undefined) {
    delete process.env.VALUATION_TARGET_FUNDS;
  } else {
    process.env.VALUATION_TARGET_FUNDS = ORIGINAL_VALUATION_TARGET_FUNDS;
  }

  if (ORIGINAL_OPENAI_BASE_URL === undefined) {
    delete process.env.OPENAI_BASE_URL;
    return;
  }
  process.env.OPENAI_BASE_URL = ORIGINAL_OPENAI_BASE_URL;
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

  test("defaults OPENAI_BASE_URL to full v1 base url", () => {
    delete process.env.OPENAI_BASE_URL;

    const config = getConfig();

    expect(config.decisionAi.openaiBaseUrl).toBe("https://api.openai.com/v1");
  });
});

import { describe, expect, test } from "vitest";
import { evaluateConfidence } from "../confidence.js";

describe("confidence scoring", () => {
  test("returns high confidence with fresh and well-fit data", () => {
    const result = evaluateConfidence({
      method: "INDEX_TRACKING",
      quoteStalenessSec: 10,
      holdingAgeDays: 20,
      fitScore: 0.9,
      recentError: 0.001
    });

    expect(result.level).toBe("HIGH");
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  test("returns low confidence when data is stale", () => {
    const result = evaluateConfidence({
      method: "BETA_PROXY",
      quoteStalenessSec: 600,
      holdingAgeDays: 360,
      fitScore: 0.2,
      recentError: 0.02
    });

    expect(result.level).toBe("LOW");
    expect(result.score).toBeLessThan(60);
  });

  test("does not apply beta penalty to fundgz direct method", () => {
    const baseInput = {
      quoteStalenessSec: 10,
      holdingAgeDays: 20,
      fitScore: 0.9,
      recentError: 0.001
    };

    const direct = evaluateConfidence({
      ...baseInput,
      method: "FUND_GZ_DIRECT"
    });
    const beta = evaluateConfidence({
      ...baseInput,
      method: "BETA_PROXY"
    });

    expect(direct.score).toBeGreaterThan(beta.score);
  });
});

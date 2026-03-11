import { describe, expect, test } from "vitest";
import { estimateByBetaProxy, estimateByIndexTracking } from "../engine.js";

describe("valuation engine", () => {
  test("computes index tracking estimate", () => {
    const result = estimateByIndexTracking({
      baseNav: 1.2,
      indexChangePct: 0.01,
      alpha: 1.1
    });

    expect(result.estimateChangePct).toBeCloseTo(0.011, 6);
    expect(result.estimateNav).toBeCloseTo(1.2132, 6);
  });

  test("computes beta proxy estimate", () => {
    const result = estimateByBetaProxy({
      baseNav: 2,
      coefficients: {
        "000300": 0.6,
        "000905": 0.4
      },
      quoteChangeByCode: {
        "000300": 0.01,
        "000905": -0.005
      }
    });

    expect(result.estimateChangePct).toBeCloseTo(0.004, 6);
    expect(result.estimateNav).toBeCloseTo(2.008, 6);
  });
});

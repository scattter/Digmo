import { describe, expect, it } from "vitest";
import { toIsoDateFromMs } from "../eastmoney-fund-provider.js";

describe("toIsoDateFromMs", () => {
  it("parses Data_netWorthTrend timestamp as Shanghai date", () => {
    // 2026-03-06 00:00:00 +08:00
    const ms = Date.parse("2026-03-05T16:00:00.000Z");
    expect(toIsoDateFromMs(ms)).toBe("2026-03-06");
  });
});

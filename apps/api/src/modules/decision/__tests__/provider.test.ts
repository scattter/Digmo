import { describe, expect, test } from "vitest";
import { validateDecisionGenerationResult } from "../provider.js";

describe("validateDecisionGenerationResult", () => {
  test("accepts plain text output", () => {
    const result = validateDecisionGenerationResult("波动较大，建议防守");

    expect(result.summary).toContain("防守");
  });

  test("accepts object output when summary exists", () => {
    const result = validateDecisionGenerationResult({
      summary: "建议保持仓位，等待更清晰信号。"
    });

    expect(result.summary).toContain("保持仓位");
  });

  test("rejects empty text output", () => {
    expect(() =>
      validateDecisionGenerationResult("   ")
    ).toThrowError(/summary/);
  });

  test("rejects object without summary", () => {
    expect(() =>
      validateDecisionGenerationResult({
        detail: "missing summary"
      })
    ).toThrowError(/summary/);
  });
});

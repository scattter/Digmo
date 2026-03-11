import { describe, expect, test } from "vitest";
import { validateDecisionGenerationResult } from "../provider";

describe("validateDecisionGenerationResult", () => {
  test("accepts valid structured output", () => {
    const result = validateDecisionGenerationResult({
      summary: "波动较大，建议防守",
      overallRiskLevel: "MEDIUM",
      actions: [
        {
          actionType: "HOLD",
          fundCode: "161725",
          rationale: "短期波动扩大",
          triggerCondition: "观察3个交易日",
          validUntil: "2026-03-07T08:00:00.000Z",
          confidence: 0.67,
          riskLevel: "MEDIUM",
          requiresSecondConfirm: false,
          citations: [
            {
              title: "策略文档",
              snippet: "波动期保持仓位",
              sourceType: "portfolio_doc"
            }
          ]
        }
      ]
    });

    expect(result.summary).toContain("防守");
    expect(result.actions.length).toBe(1);
  });

  test("rejects action with empty citations", () => {
    expect(() =>
      validateDecisionGenerationResult({
        summary: "test",
        overallRiskLevel: "LOW",
        actions: [
          {
            actionType: "HOLD",
            fundCode: "161725",
            rationale: "test",
            triggerCondition: "test",
            validUntil: "2026-03-07T08:00:00.000Z",
            confidence: 0.5,
            riskLevel: "LOW",
            requiresSecondConfirm: false,
            citations: []
          }
        ]
      })
    ).toThrowError(/citations/);
  });

  test("rejects action with non-portfolio code format", () => {
    expect(() =>
      validateDecisionGenerationResult({
        summary: "test",
        overallRiskLevel: "LOW",
        actions: [
          {
            actionType: "SELL",
            fundCode: "ABC123",
            rationale: "test",
            triggerCondition: "test",
            validUntil: "2026-03-07T08:00:00.000Z",
            confidence: 0.4,
            riskLevel: "HIGH",
            requiresSecondConfirm: true,
            citations: [
              {
                title: "行情",
                snippet: "test",
                sourceType: "market_context"
              }
            ]
          }
        ]
      })
    ).toThrowError(/fundCode/);
  });
});

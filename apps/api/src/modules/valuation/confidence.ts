import { ConfidenceLevel, ValuationMethod } from "@digmo/shared";

export interface ConfidenceInput {
  method: ValuationMethod;
  quoteStalenessSec: number;
  holdingAgeDays: number;
  fitScore: number;
  recentError?: number;
}

export interface ConfidenceResult {
  score: number;
  level: ConfidenceLevel;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function evaluateConfidence(input: ConfidenceInput): ConfidenceResult {
  let score = 100;

  score -= Math.min(40, input.quoteStalenessSec / 6);
  score -= Math.min(25, input.holdingAgeDays / 8);
  score -= (1 - clamp(input.fitScore, 0, 1)) * 25;

  if (typeof input.recentError === "number") {
    score -= Math.min(20, input.recentError * 1000);
  }

  if (input.method === "BETA_PROXY") {
    score -= 5;
  }

  score = Number(clamp(score, 0, 100).toFixed(2));

  if (score >= 80) {
    return { score, level: "HIGH" };
  }

  if (score >= 60) {
    return { score, level: "MEDIUM" };
  }

  return { score, level: "LOW" };
}

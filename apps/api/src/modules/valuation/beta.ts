import { NavRecord } from "@digmo/shared";
import { HistoricalReturn } from "../data/provider";

export interface BetaCalibrationResult {
  coefficients: Record<string, number>;
  fitScore: number;
}

interface RegressionScore {
  code: string;
  coefficient: number;
  fitScore: number;
}

const DEFAULT_COEFFICIENTS: Record<string, number> = {
  "000300": 0.6,
  "000905": 0.3,
  "399006": 0.1
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreSingleFactor(navRecords: NavRecord[], indexReturns: HistoricalReturn[], code: string): RegressionScore {
  const indexMap = new Map(indexReturns.map((item) => [item.date, item.changePct]));
  const aligned = navRecords
    .map((nav) => ({
      y: nav.dailyReturn,
      x: indexMap.get(nav.navDate)
    }))
    .filter((item): item is { y: number; x: number } => typeof item.x === "number");

  if (aligned.length < 30) {
    return {
      code,
      coefficient: 0,
      fitScore: 0
    };
  }

  const xMean = aligned.reduce((acc, item) => acc + item.x, 0) / aligned.length;
  const yMean = aligned.reduce((acc, item) => acc + item.y, 0) / aligned.length;

  let cov = 0;
  let xVar = 0;
  let yVar = 0;

  for (const pair of aligned) {
    cov += (pair.x - xMean) * (pair.y - yMean);
    xVar += (pair.x - xMean) ** 2;
    yVar += (pair.y - yMean) ** 2;
  }

  if (xVar === 0 || yVar === 0) {
    return {
      code,
      coefficient: 0,
      fitScore: 0
    };
  }

  const slope = clamp(cov / xVar, -1.5, 1.5);
  const corr = cov / Math.sqrt(xVar * yVar);

  return {
    code,
    coefficient: Number(slope.toFixed(4)),
    fitScore: Number((corr ** 2).toFixed(4))
  };
}

export function calibrateBeta(
  navRecords: NavRecord[],
  indexHistoryByCode: Record<string, HistoricalReturn[]>
): BetaCalibrationResult {
  const scores = Object.entries(indexHistoryByCode)
    .map(([code, history]) => scoreSingleFactor(navRecords, history, code))
    .filter((item) => item.fitScore > 0)
    .sort((a, b) => b.fitScore - a.fitScore);

  if (scores.length === 0) {
    return {
      coefficients: DEFAULT_COEFFICIENTS,
      fitScore: 0.3
    };
  }

  const top = scores.slice(0, 3);
  const coefficients: Record<string, number> = {};

  for (const item of top) {
    coefficients[item.code] = item.coefficient;
  }

  const fitScore = top.reduce((acc, item) => acc + item.fitScore, 0) / top.length;

  return {
    coefficients,
    fitScore: Number(fitScore.toFixed(4))
  };
}

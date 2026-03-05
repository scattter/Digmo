import { HistoricalReturn } from "../data/provider";
import { NavRecord } from "@digmo/shared";

export interface AlphaCalibrationResult {
  alpha: number;
  fitScore: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

export function calibrateAlpha(navRecords: NavRecord[], indexReturns: HistoricalReturn[]): AlphaCalibrationResult {
  const indexMap = new Map(indexReturns.map((item) => [item.date, item.changePct]));
  const aligned = navRecords
    .map((nav) => ({
      y: nav.dailyReturn,
      x: indexMap.get(nav.navDate)
    }))
    .filter((item): item is { y: number; x: number } => typeof item.x === "number");

  if (aligned.length < 20) {
    return {
      alpha: 1,
      fitScore: 0.4
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
      alpha: 1,
      fitScore: 0.2
    };
  }

  const alpha = clamp(cov / xVar, 0.3, 1.8);
  const corr = cov / Math.sqrt(xVar * yVar);
  const fitScore = clamp(corr ** 2, 0, 1);

  return {
    alpha: round(alpha),
    fitScore: round(fitScore)
  };
}

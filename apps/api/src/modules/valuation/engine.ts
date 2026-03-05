export interface IndexTrackingInput {
  baseNav: number;
  indexChangePct: number;
  alpha: number;
  fxAdj?: number;
}

export interface BetaProxyInput {
  baseNav: number;
  coefficients: Record<string, number>;
  quoteChangeByCode: Record<string, number>;
  fxAdj?: number;
}

export interface EstimateResult {
  estimateNav: number;
  estimateChangePct: number;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

export function estimateByIndexTracking(input: IndexTrackingInput): EstimateResult {
  const fxAdj = input.fxAdj ?? 0;
  const estimateChangePct = input.indexChangePct * input.alpha + fxAdj;
  const estimateNav = input.baseNav * (1 + estimateChangePct);

  return {
    estimateNav: round(estimateNav),
    estimateChangePct: round(estimateChangePct)
  };
}

export function estimateByBetaProxy(input: BetaProxyInput): EstimateResult {
  const fxAdj = input.fxAdj ?? 0;

  const factorReturn = Object.entries(input.coefficients).reduce((acc, [code, coefficient]) => {
    return acc + coefficient * (input.quoteChangeByCode[code] ?? 0);
  }, 0);

  const estimateChangePct = factorReturn + fxAdj;
  const estimateNav = input.baseNav * (1 + estimateChangePct);

  return {
    estimateNav: round(estimateNav),
    estimateChangePct: round(estimateChangePct)
  };
}

export function calcDailyProfitAmount(holdingAmount: number, changePct: number): number {
  const amount = Number((holdingAmount * changePct).toFixed(2));
  return amount === 0 ? 0 : amount;
}

export function calcDailyProfitPct(dailyProfitAmount: number, totalAmount: number): number {
  const pct = totalAmount > 0 ? Number((dailyProfitAmount / totalAmount).toFixed(6)) : 0;
  return pct === 0 ? 0 : pct;
}

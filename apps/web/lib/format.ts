import { TrendType } from "@digmo/shared";

export interface FundEditState {
  holdingAmount: string;
  plannedRatio: string;
  holdingProfitAmount: string;
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatSignedAmount(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatCurrency(value)}`;
}

export function formatSignedAmountCompact(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

export function formatSignedCurrency(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}¥${formatCurrency(Math.abs(value))}`;
}

export function formatSignedPct(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatPct(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }
  return `${(value * 100).toFixed(2)}%`;
}

export function formatBeijingTime(input: string): string {
  return new Date(input).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export function formatEstimateTime(input: string | undefined, now = new Date()): string {
  if (!input || !Number.isFinite(new Date(input).getTime())) {
    return "";
  }
  const dateOptions: Intl.DateTimeFormatOptions = { timeZone: "Asia/Shanghai" };
  const isToday = new Date(input).toLocaleDateString("zh-CN", dateOptions) ===
    now.toLocaleDateString("zh-CN", dateOptions);
  return `${isToday ? "行情时间" : "最近行情"} ${formatBeijingTime(input)}`;
}

export function parseNonNegativeNumber(raw: string): number | undefined {
  const normalized = raw.trim().replace(/,/g, "");
  if (!normalized) {
    return undefined;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Number(value.toFixed(2));
}

export function parseSignedNumber(raw: string): number | undefined {
  const normalized = raw.trim().replace(/,/g, "");
  if (!normalized) {
    return undefined;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Number(value.toFixed(2));
}

export function parseRatioPercent(raw: string): number | undefined {
  const normalized = raw.trim().replace("%", "");
  if (!normalized) {
    return undefined;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return undefined;
  }
  return Number((value / 100).toFixed(6));
}

export function deltaClassByPct(value: number): "text-success" | "text-danger" | "text-muted-foreground" {
  if (value > 0.0001) {
    return "text-success";
  }
  if (value < -0.0001) {
    return "text-danger";
  }
  return "text-muted-foreground";
}

export function trendTone(trend: TrendType): string {
  if (trend === "UP") {
    return "border-success/30 bg-success/15 text-success hover:bg-success/15";
  }
  if (trend === "DOWN") {
    return "border-danger/30 bg-danger/15 text-danger hover:bg-danger/15";
  }
  return "border-warning/30 bg-warning/15 text-warning hover:bg-warning/15";
}

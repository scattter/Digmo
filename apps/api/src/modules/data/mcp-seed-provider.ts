import { FundProfile, HoldingSnapshot, NavRecord } from "@digmo/shared";
import { formatDate, getShanghaiWeekday, nowInShanghai } from "../../utils/time.js";
import { FundDataProvider, HistoricalReturn } from "./provider.js";

interface IndexSeries {
  code: string;
  name: string;
  returns: HistoricalReturn[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function generateTradingDates(length: number): string[] {
  const dates: string[] = [];
  const current = nowInShanghai();
  while (dates.length < length) {
    const day = getShanghaiWeekday(current);
    if (day !== 0 && day !== 6) {
      dates.push(formatDate(current));
    }
    current.setDate(current.getDate() - 1);
  }

  return dates.reverse();
}

function buildIndexSeries(dates: string[]): Map<string, IndexSeries> {
  const definitions = [
    { code: "399997", name: "中证白酒", drift: 0.0007, vol: 0.018, freq: 3.2 },
    { code: "000300", name: "沪深300", drift: 0.0004, vol: 0.01, freq: 4.7 },
    { code: "000905", name: "中证500", drift: 0.0005, vol: 0.014, freq: 5.1 },
    { code: "399006", name: "创业板指", drift: 0.0009, vol: 0.02, freq: 2.6 }
  ];

  const map = new Map<string, IndexSeries>();

  for (const definition of definitions) {
    const returns = dates.map((date, index) => {
      const seasonal = Math.sin(index / definition.freq) * definition.vol;
      const noise = Math.cos(index / (definition.freq + 1.5)) * (definition.vol / 3);
      return {
        date,
        changePct: round(clamp(definition.drift + seasonal + noise, -0.095, 0.095))
      };
    });

    map.set(definition.code, {
      code: definition.code,
      name: definition.name,
      returns
    });
  }

  return map;
}

function buildFundNavHistory(
  fundCode: string,
  dates: string[],
  indexMap: Map<string, IndexSeries>,
  recipe: {
    baseNav: number;
    coefficients: Record<string, number>;
    noiseFreq: number;
    noiseScale: number;
  }
): NavRecord[] {
  let nav = recipe.baseNav;

  return dates.map((date, index) => {
    let dailyReturn = 0;

    for (const [indexCode, coefficient] of Object.entries(recipe.coefficients)) {
      const indexSeries = indexMap.get(indexCode);
      if (!indexSeries) {
        continue;
      }
      dailyReturn += indexSeries.returns[index].changePct * coefficient;
    }

    dailyReturn += Math.sin(index / recipe.noiseFreq) * recipe.noiseScale;
    dailyReturn = clamp(dailyReturn, -0.09, 0.09);

    nav = nav * (1 + dailyReturn);

    return {
      fundCode,
      navDate: date,
      nav: Number(nav.toFixed(4)),
      dailyReturn: round(dailyReturn)
    };
  });
}

function applyOfficialNav(
  records: NavRecord[],
  official: {
    navDate: string;
    nav: number;
    dailyReturn: number;
  }
): NavRecord[] {
  if (records.length === 0) {
    return records;
  }

  const filtered = records.filter((record) => record.navDate <= official.navDate);
  const existingIndex = filtered.findIndex((record) => record.navDate === official.navDate);

  if (existingIndex >= 0) {
    filtered[existingIndex] = {
      ...filtered[existingIndex],
      nav: official.nav,
      dailyReturn: official.dailyReturn
    };
  } else {
    filtered.push({
      fundCode: records[0].fundCode,
      navDate: official.navDate,
      nav: official.nav,
      dailyReturn: official.dailyReturn
    });
  }

  filtered.sort((a, b) => a.navDate.localeCompare(b.navDate));
  return filtered;
}

function toRatioFromPercentText(percentText: string): number {
  const normalized = percentText.replace("%", "").trim();
  const value = Number(normalized);
  if (Number.isNaN(value)) {
    return 0;
  }
  return Number((value / 100).toFixed(4));
}

function toDailyReturnFromPercentText(percentText: string): number {
  return toRatioFromPercentText(percentText);
}

function parseReportDate(input: string): string {
  // e.g. "2025年12月31日" -> "2025-12-31"
  return input.replace("年", "-").replace("月", "-").replace("日", "");
}

function buildHoldingSnapshotFromTop(
  fundCode: string,
  reportDate: string,
  stockRatio: number,
  bondRatio: number,
  cashRatio: number,
  rows: Array<{
    code: string;
    name: string;
    ratioPercent: string;
  }>
): HoldingSnapshot {
  return {
    fundCode,
    reportDate,
    stockRatio,
    bondRatio,
    cashRatio,
    holdings: rows.map((row) => ({
      code: row.code,
      name: row.name,
      ratio: toRatioFromPercentText(row.ratioPercent)
    }))
  };
}

function buildLatestOverride(
  navDate: string,
  nav: number,
  dailyReturnPercent: string
): {
  navDate: string;
  nav: number;
  dailyReturn: number;
} {
  return {
    navDate,
    nav,
    dailyReturn: toDailyReturnFromPercentText(dailyReturnPercent)
  };
}

export class McpSeedFundDataProvider implements FundDataProvider {
  private readonly targetFunds: string[];

  private readonly profiles: Map<string, FundProfile>;

  private readonly holdings: Map<string, HoldingSnapshot>;

  private readonly navHistory: Map<string, NavRecord[]>;

  private readonly indexReturns: Map<string, IndexSeries>;

  constructor(targetFunds: string[]) {
    this.targetFunds = targetFunds;

    const dates = generateTradingDates(220);
    this.indexReturns = buildIndexSeries(dates);

    this.profiles = new Map<string, FundProfile>([
      [
        "161725",
        {
          fundCode: "161725",
          fundName: "招商中证白酒指数A",
          fundType: "股票型",
          indexCode: "399997"
        }
      ],
      [
        "110011",
        {
          fundCode: "110011",
          fundName: "易方达优质精选混合(QDII)",
          fundType: "QDII偏股混合"
        }
      ],
      [
        "006327",
        {
          fundCode: "006327",
          fundName: "易方达中证海外联接人民币A",
          fundType: "QDII股票指数",
          indexCode: "H30533"
        }
      ]
    ]);

    const quarterReportDate = parseReportDate("2025年12月31日");
    this.holdings = new Map<string, HoldingSnapshot>([
      [
        "161725",
        {
          fundCode: "161725",
          reportDate: quarterReportDate,
          stockRatio: 0.88,
          bondRatio: 0,
          cashRatio: 0.12,
          holdings: [
            { code: "600519", name: "贵州茅台", ratio: 0.1538 },
            { code: "600809", name: "山西汾酒", ratio: 0.1511 },
            { code: "000858", name: "五粮液", ratio: 0.1465 }
          ]
        }
      ],
      [
        "110011",
        buildHoldingSnapshotFromTop("110011", quarterReportDate, 0.8395, 0, 0.1605, [
          { code: "00700", name: "腾讯控股", ratioPercent: "9.96%" },
          { code: "600519", name: "贵州茅台", ratioPercent: "9.92%" },
          { code: "000568", name: "泸州老窖", ratioPercent: "9.59%" },
          { code: "600809", name: "山西汾酒", ratioPercent: "9.53%" },
          { code: "000858", name: "五粮液", ratioPercent: "9.52%" }
        ])
      ],
      [
        "006327",
        buildHoldingSnapshotFromTop("006327", quarterReportDate, 0.9328, 0.03, 0.0424, [
          {
            code: "513050",
            name: "易方达中证海外中国互联网50(QDII-ETF)",
            ratioPercent: "93.28%"
          },
          { code: "210208", name: "21国开08", ratioPercent: "3.00%" }
        ])
      ]
    ]);

    this.navHistory = new Map<string, NavRecord[]>([
      [
        "161725",
        applyOfficialNav(
          buildFundNavHistory("161725", dates, this.indexReturns, {
            baseNav: 0.71,
            coefficients: {
              "399997": 1.03
            },
            noiseFreq: 9,
            noiseScale: 0.0015
          }),
          buildLatestOverride("2026-02-27", 0.6854, "-0.19%")
        )
      ],
      [
        "110011",
        applyOfficialNav(
          buildFundNavHistory("110011", dates, this.indexReturns, {
            baseNav: 5.05,
            coefficients: {
              "000300": 0.52,
              "000905": 0.18,
              "399006": 0.3
            },
            noiseFreq: 11,
            noiseScale: 0.003
          }),
          buildLatestOverride("2026-02-27", 5.2384, "0.42%")
        )
      ],
      [
        "006327",
        applyOfficialNav(
          buildFundNavHistory("006327", dates, this.indexReturns, {
            baseNav: 1.08,
            coefficients: {
              "000300": 0.38,
              "000905": 0.22,
              "399006": 0.4
            },
            noiseFreq: 6,
            noiseScale: 0.004
          }),
          buildLatestOverride("2026-02-26", 1.0229, "-2.53%")
        )
      ]
    ]);
  }

  async listTargetFundCodes(): Promise<string[]> {
    const available = [...this.profiles.keys()];
    if (this.targetFunds.length === 0) {
      return available;
    }

    return this.targetFunds.filter((code) => available.includes(code));
  }

  async getFundProfile(fundCode: string): Promise<FundProfile | undefined> {
    return this.profiles.get(fundCode);
  }

  async getLatestNavRecord(fundCode: string): Promise<NavRecord | undefined> {
    return this.navHistory.get(fundCode)?.at(-1);
  }

  async getRecentNavRecords(fundCode: string, limit: number): Promise<NavRecord[]> {
    const records = this.navHistory.get(fundCode) ?? [];
    return records.slice(Math.max(0, records.length - limit));
  }

  async getHoldingSnapshot(fundCode: string): Promise<HoldingSnapshot | undefined> {
    return this.holdings.get(fundCode);
  }
}

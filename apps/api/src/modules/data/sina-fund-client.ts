export interface RealtimeFundEstimate {
  fundCode: string;
  fundName: string;
  officialNav: number;
  officialDailyReturn?: number;
  estimateNav: number;
  estimateChangePct: number;
  baseNavDate: string;
  quoteTime: string;
}

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 32 * 1024;

function toNumber(raw: string | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function isValidDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const value = new Date(`${raw}T00:00:00.000Z`);
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === raw;
}

function parseQuoteTime(date: string, time: string): string | undefined {
  const match = time.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!isValidDate(date) || !match) return undefined;
  const [, hour, minute, second = "00"] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return undefined;
  return `${date}T${hour}:${minute}:${second}+08:00`;
}

function readFields(text: string, symbol: string): string[] {
  const match = text.match(new RegExp(`(?:^|[;\\s])var\\s+hq_str_${symbol}="([^"\\r\\n]*)"`));
  return match?.[1]?.split(",").map((field) => field.trim()) ?? [];
}

async function readText(response: Response, encoding = "utf-8"): Promise<string | undefined> {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    return undefined;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder(encoding);
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return undefined;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function findBaseNav(
  fundCode: string,
  officialNav: number,
  quoteDate: string,
  signal: AbortSignal
): Promise<{ date: string; dailyReturn?: number } | undefined> {
  const query = new URLSearchParams({ fundCode, pageIndex: "1", pageSize: "3" });
  const response = await fetch(`https://api.fund.eastmoney.com/f10/lsjz?${query}`, {
    headers: { Referer: "https://fundf10.eastmoney.com/", "User-Agent": "Mozilla/5.0" },
    signal,
    redirect: "error"
  });
  const text = await readText(response);
  if (!text) return undefined;
  const payload = JSON.parse(text) as { Data?: { LSJZList?: Array<{ FSRQ?: string; DWJZ?: string; JZZZL?: string }> } };
  if (!Array.isArray(payload.Data?.LSJZList)) return undefined;
  const row = payload.Data.LSJZList
    .filter((item) => typeof item.FSRQ === "string" && isValidDate(item.FSRQ) && item.FSRQ < quoteDate &&
      toNumber(item.DWJZ) === officialNav)
    .sort((a, b) => b.FSRQ!.localeCompare(a.FSRQ!))[0];
  if (!row?.FSRQ) return undefined;
  const dailyReturn = toNumber(row.JZZZL);
  return { date: row.FSRQ, dailyReturn: dailyReturn === undefined ? undefined : dailyReturn / 100 };
}

export async function fetchSinaFundEstimate(fundCode: string): Promise<RealtimeFundEstimate | undefined> {
  if (!/^\d{6}$/.test(fundCode)) return undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://hq.sinajs.cn/list=fu_${fundCode},of${fundCode}`, {
      headers: { Referer: "https://finance.sina.com.cn/", "User-Agent": "Mozilla/5.0", Accept: "*/*" },
      signal: controller.signal,
      redirect: "error"
    });
    const text = await readText(response, "gb18030");
    if (!text) return undefined;
    const estimate = readFields(text, `fu_${fundCode}`);
    const nav = readFields(text, `of${fundCode}`);
    const officialNav = toNumber(estimate[3]);
    const estimateNav = toNumber(estimate[2]);
    const percent = toNumber(estimate[6]);
    const quoteDate = estimate[7] ?? "";
    const quoteTime = parseQuoteTime(quoteDate, estimate[1] ?? "");
    // 净值与百分比各自舍入，校验时兼容四位净值和两位百分比的误差。
    if (!estimate[0] || !quoteTime || !officialNav || officialNav <= 0 || !estimateNav || estimateNav <= 0 ||
      percent === undefined || Math.abs(estimateNav / officialNav - 1 - percent / 100) > 0.0002 / officialNav + 0.000051) {
      return undefined;
    }

    let baseNavDate = nav[5] ?? "";
    const officialPercent = toNumber(nav[4]);
    let officialDailyReturn = officialPercent === undefined ? undefined : officialPercent / 100;
    // 公布净值可能先于估值刷新，必须核对估值实际使用的净值与日期，不能直接套用最新净值日。
    if (!isValidDate(baseNavDate) || baseNavDate >= quoteDate || toNumber(nav[1]) !== officialNav) {
      const base = await findBaseNav(fundCode, officialNav, quoteDate, controller.signal);
      if (!base) return undefined;
      baseNavDate = base.date;
      officialDailyReturn = base.dailyReturn;
    }

    return {
      fundCode,
      fundName: estimate[0],
      officialNav,
      officialDailyReturn,
      estimateNav,
      estimateChangePct: Number((percent / 100).toFixed(6)) || 0,
      baseNavDate,
      quoteTime
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

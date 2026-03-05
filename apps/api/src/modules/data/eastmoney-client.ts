import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { TextDecoder } from "node:util";

export interface EastmoneyClientOptions {
  enabled: boolean;
  baseUrl: string;
  timeoutMs: number;
  userAgent: string;
  referer: string;
}

export interface EastmoneyQuote {
  code: string;
  name?: string;
  current?: number;
  // Percentage points, e.g. -0.62 means -0.62%
  percent?: number;
  // f20/f21 are total/float market cap in CNY
  marketCapital?: number;
  floatMarketCapital?: number;
  amount?: number;
  volume?: number;
}

interface EastmoneyStockResponse {
  data?: {
    f57?: string;
    f58?: string;
    f43?: number;
    f60?: number;
    f170?: number;
    f116?: number;
    f117?: number;
    f6?: number;
    f47?: number;
  };
}

const SINA_QUOTE_BASE_URL = "http://hq.sinajs.cn";

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeSecId(stockCode: string): string {
  const code = stockCode.trim();
  if (code.startsWith("6") || code.startsWith("5") || code.startsWith("9")) {
    return `1.${code}`;
  }
  return `0.${code}`;
}

function buildEastmoneyUrl(baseUrl: string, secid: string): string {
  const query = new URLSearchParams({
    secid,
    invt: "2",
    fltt: "2",
    fields: "f57,f58,f43,f60,f170,f116,f117,f6,f47"
  });

  const normalized = baseUrl.replace(/\/$/, "");
  return `${normalized}/api/qt/stock/get?${query.toString()}`;
}

function getCandidateBaseUrls(primary: string): string[] {
  const candidates = [
    primary,
    "https://push2delay.eastmoney.com",
    "https://82.push2delay.eastmoney.com",
    "https://push2.eastmoney.com"
  ];

  return [...new Set(candidates.map((item) => item.replace(/\/$/, "")))];
}

function requestBuffer(url: string, headers: Record<string, string>, timeoutMs: number): Promise<Buffer | undefined> {
  return new Promise((resolve) => {
    const target = new URL(url);
    const request = target.protocol === "http:" ? httpRequest : httpsRequest;

    const req = request(
      target,
      {
        method: "GET",
        headers
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          res.resume();
          resolve(undefined);
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          if (typeof chunk === "string") {
            chunks.push(Buffer.from(chunk));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve(Buffer.concat(chunks));
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(undefined);
    });

    req.on("error", () => resolve(undefined));
    req.end();
  });
}

function decodeGbkPayload(payload: Buffer): string {
  try {
    return new TextDecoder("gb18030").decode(payload);
  } catch {
    return payload.toString("latin1");
  }
}

async function getJson<T>(url: string, headers: Record<string, string>, timeoutMs: number): Promise<T | undefined> {
  const payload = await requestBuffer(url, headers, timeoutMs);
  if (!payload) {
    return undefined;
  }

  try {
    return JSON.parse(payload.toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

async function getText(url: string, headers: Record<string, string>, timeoutMs: number, encoding: "utf8" | "gbk"): Promise<string | undefined> {
  const payload = await requestBuffer(url, headers, timeoutMs);
  if (!payload) {
    return undefined;
  }

  if (encoding === "gbk") {
    return decodeGbkPayload(payload);
  }

  return payload.toString("utf8");
}

function normalizePrice(value: number | undefined): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  return Number(value.toFixed(4));
}

function normalizePercent(value: number | undefined): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  return Number(value.toFixed(6));
}

function parseEastmoneyScaledPrice(value: number | undefined): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  return Number((value / 100).toFixed(4));
}

function normalizeEastmoneyPercent(f170: number | undefined, current?: number, previousClose?: number): number | undefined {
  if (typeof f170 === "number") {
    return Number((f170 / 100).toFixed(6));
  }

  if (typeof current === "number" && typeof previousClose === "number" && previousClose > 0) {
    return Number((((current - previousClose) / previousClose) * 100).toFixed(6));
  }

  return undefined;
}

function isAshareCode(code: string): boolean {
  return /^[0236]\d{5}$/.test(code);
}

function isHongKongCode(code: string): boolean {
  return /^\d{5}$/.test(code);
}

function isEtfLikeCode(code: string): boolean {
  return /^[59]\d{5}$/.test(code);
}

function toEtfSecId(code: string): string {
  return code.startsWith("5") ? `1.${code}` : `0.${code}`;
}

export class EastmoneyQuoteClient {
  private readonly options: EastmoneyClientOptions;

  constructor(options: EastmoneyClientOptions) {
    this.options = options;
  }

  isEnabled(): boolean {
    return this.options.enabled;
  }

  async fetchQuoteByCode(code: string): Promise<EastmoneyQuote | undefined> {
    if (!this.options.enabled || code.trim().length === 0) {
      return undefined;
    }

    const normalizedCode = code.trim();
    if (!/^\d{5,6}$/.test(normalizedCode)) {
      return undefined;
    }

    if (isAshareCode(normalizedCode)) {
      const fromSina = await this.fetchAshareBySina(normalizedCode);
      if (fromSina) {
        return fromSina;
      }
    }

    if (isHongKongCode(normalizedCode)) {
      const fromHk = await this.fetchByEastmoneySecId(`116.${normalizedCode}`);
      if (fromHk) {
        return fromHk;
      }
    }

    if (isEtfLikeCode(normalizedCode)) {
      const fromEtf = await this.fetchByEastmoneySecId(toEtfSecId(normalizedCode));
      if (fromEtf) {
        return fromEtf;
      }
    }

    return this.fetchByEastmoneySecId(normalizeSecId(normalizedCode));
  }

  private async fetchAshareBySina(code: string): Promise<EastmoneyQuote | undefined> {
    const fullCode = code.startsWith("6") ? `sh${code}` : `sz${code}`;
    const url = `${SINA_QUOTE_BASE_URL}/list=${fullCode}`;

    const text = await getText(
      url,
      {
        Accept: "*/*",
        "User-Agent": this.options.userAgent,
        Referer: this.options.referer
      },
      this.options.timeoutMs,
      "gbk"
    );

    if (!text) {
      return undefined;
    }

    const match = text.match(/="([^"]*)"/);
    if (!match?.[1]) {
      return undefined;
    }

    const fields = match[1].split(",");
    if (fields.length < 4) {
      return undefined;
    }

    const previousClose = toNumber(fields[2]);
    const current = toNumber(fields[3]);

    if (typeof previousClose !== "number" || previousClose <= 0 || typeof current !== "number") {
      return undefined;
    }

    const percent = Number((((current - previousClose) / previousClose) * 100).toFixed(6));

    return {
      code,
      name: fields[0] || undefined,
      current: normalizePrice(current),
      percent
    };
  }

  private async fetchByEastmoneySecId(secid: string): Promise<EastmoneyQuote | undefined> {
    const baseUrls = getCandidateBaseUrls(this.options.baseUrl);

    for (const baseUrl of baseUrls) {
      const url = buildEastmoneyUrl(baseUrl, secid);
      const payload = await getJson<EastmoneyStockResponse>(
        url,
        {
          Accept: "application/json, text/plain, */*",
          "User-Agent": this.options.userAgent,
          Referer: this.options.referer
        },
        this.options.timeoutMs
      );

      const row = payload?.data;
      const code = row?.f57?.trim();
      if (!row || !code) {
        continue;
      }

      const current = parseEastmoneyScaledPrice(toNumber(row.f43));
      const previousClose = parseEastmoneyScaledPrice(toNumber(row.f60));
      const percent = normalizeEastmoneyPercent(toNumber(row.f170), current, previousClose);

      return {
        code,
        name: row.f58,
        current,
        percent: normalizePercent(percent),
        marketCapital: toNumber(row.f116),
        floatMarketCapital: toNumber(row.f117),
        amount: toNumber(row.f6),
        volume: toNumber(row.f47)
      };
    }

    return undefined;
  }
}

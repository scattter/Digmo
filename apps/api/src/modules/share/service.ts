import {
  ERROR_CODES,
  ImportPortfolioByShareCodeResult,
  PortfolioShareResult,
  PortfolioShareValidity,
  PortfolioSummary,
  PortfolioType,
} from "@digmo/shared";
import { verifyPassword, hashPassword } from "../auth/password.js";
import {
  PortfolioFundItem,
  PortfolioItem,
  PortfolioShareRecord,
  WatchlistStore,
} from "../../infra/watchlist/sqlite-watchlist-store.js";
import { AppError } from "../../utils/app-error.js";

interface ShareServiceDeps {
  store: WatchlistStore;
  cache?: ShareCache;
  logger?: {
    warn: (payload: unknown, message?: string) => void;
  };
}

interface PortfolioShareSnapshot {
  sourcePortfolioId: string;
  sourcePortfolioName: string;
  portfolioType: PortfolioType;
  funds: Array<{
    fundCode: string;
    plannedRatio?: number;
  }>;
  sharedAt: string;
}

interface ShareCacheValue {
  id: string;
  userId: string;
  portfolioId: string;
  shareCode: string;
  status: "ACTIVE" | "INACTIVE";
  snapshotJson: string;
  passwordHash?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShareCache {
  get(shareCode: string): Promise<ShareCacheValue | undefined>;
  set(record: ShareCacheValue): Promise<void>;
  delete(shareCode: string): Promise<void>;
}

function toSummary(portfolio: PortfolioItem, fundCount: number): PortfolioSummary {
  return {
    id: portfolio.id,
    name: portfolio.name,
    type: portfolio.type,
    fundCount,
    totalAmount: 0,
    totalAsset: portfolio.totalAsset,
    cashAmount: portfolio.totalAsset,
    cashRatio: portfolio.totalAsset > 0 ? 1 : 0,
    totalProfitAmount: 0,
    totalProfitPct: 0,
    totalProfitDisplay: "0.00 / 0.00%",
    dailyProfitAmount: 0,
    dailyProfitPct: 0,
    allFundsDailyUpdated: false,
    intradayEstimatePct: 0,
  };
}

function normalizeShareCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function parseSnapshot(snapshotJson: string): PortfolioShareSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshotJson);
  } catch {
    throw new AppError(ERROR_CODES.SHARE_NOT_AVAILABLE, "share snapshot is invalid", 404);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AppError(ERROR_CODES.SHARE_NOT_AVAILABLE, "share snapshot is invalid", 404);
  }

  const payload = parsed as {
    sourcePortfolioId?: unknown;
    sourcePortfolioName?: unknown;
    portfolioType?: unknown;
    funds?: unknown;
    sharedAt?: unknown;
  };

  const sourcePortfolioId = typeof payload.sourcePortfolioId === "string" ? payload.sourcePortfolioId.trim() : "";
  const sourcePortfolioName = typeof payload.sourcePortfolioName === "string" ? payload.sourcePortfolioName.trim() : "";
  const portfolioType = payload.portfolioType === "RATIO" ? "RATIO" : payload.portfolioType === "FREE" ? "FREE" : undefined;
  const sharedAt = typeof payload.sharedAt === "string" ? payload.sharedAt : new Date().toISOString();

  if (!sourcePortfolioId || !sourcePortfolioName || !portfolioType || !Array.isArray(payload.funds)) {
    throw new AppError(ERROR_CODES.SHARE_NOT_AVAILABLE, "share snapshot is invalid", 404);
  }

  const funds = payload.funds
    .map((item) => {
      if (!item || typeof item !== "object") {
        return undefined;
      }
      const raw = item as { fundCode?: unknown; plannedRatio?: unknown };
      const fundCode = typeof raw.fundCode === "string" ? raw.fundCode.trim() : "";
      if (!/^\d{6}$/.test(fundCode)) {
        return undefined;
      }
      const plannedRatioRaw = typeof raw.plannedRatio === "number" ? raw.plannedRatio : undefined;
      const plannedRatio =
        typeof plannedRatioRaw === "number" && Number.isFinite(plannedRatioRaw)
          ? Number(Math.max(0, Math.min(1, plannedRatioRaw)).toFixed(6))
          : undefined;

      return {
        fundCode,
        ...(typeof plannedRatio === "number" ? { plannedRatio } : {}),
      };
    })
    .filter((item): item is { fundCode: string; plannedRatio?: number } => Boolean(item));

  if (funds.length === 0) {
    throw new AppError(ERROR_CODES.SHARE_NOT_AVAILABLE, "share snapshot has no funds", 404);
  }

  return {
    sourcePortfolioId,
    sourcePortfolioName,
    portfolioType,
    funds,
    sharedAt,
  };
}

function buildSnapshot(portfolio: PortfolioItem, funds: PortfolioFundItem[]): PortfolioShareSnapshot {
  return {
    sourcePortfolioId: portfolio.id,
    sourcePortfolioName: portfolio.name,
    portfolioType: portfolio.type,
    funds: funds.map((item) => ({
      fundCode: item.fundCode,
      ...(typeof item.plannedRatio === "number" ? { plannedRatio: item.plannedRatio } : {}),
    })),
    sharedAt: new Date().toISOString(),
  };
}

function importedNameCandidate(baseName: string, index: number): string {
  const suffix = index <= 1 ? " (导入)" : ` (导入${index})`;
  const maxBaseLength = Math.max(1, 40 - suffix.length);
  return `${baseName.slice(0, maxBaseLength)}${suffix}`;
}

function toCacheValue(record: PortfolioShareRecord): ShareCacheValue {
  return {
    id: record.id,
    userId: record.userId,
    portfolioId: record.portfolioId,
    shareCode: record.shareCode,
    status: record.status,
    snapshotJson: record.snapshotJson,
    ...(record.passwordHash ? { passwordHash: record.passwordHash } : {}),
    ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class ShareService {
  private readonly store: WatchlistStore;
  private readonly cache?: ShareCache;
  private readonly logger?: {
    warn: (payload: unknown, message?: string) => void;
  };

  constructor(deps: ShareServiceDeps) {
    this.store = deps.store;
    this.cache = deps.cache;
    this.logger = deps.logger;
  }

  async createShare(input: {
    userId: string;
    portfolioId: string;
    validity: PortfolioShareValidity;
    password?: string;
  }): Promise<PortfolioShareResult> {
    const portfolio = await this.store.getPortfolio(input.userId, input.portfolioId);
    if (!portfolio) {
      throw new AppError(ERROR_CODES.PORTFOLIO_NOT_FOUND, "portfolio not found", 404);
    }

    const funds = await this.store.listPortfolioFunds(input.userId, input.portfolioId);
    if (funds.length === 0) {
      throw new AppError(ERROR_CODES.INVALID_PORTFOLIO, "portfolio has no funds to share", 400);
    }

    const expiresAt =
      input.validity === "SEVEN_DAYS"
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : undefined;
    const passwordHash = input.password ? hashPassword(input.password) : undefined;
    const snapshot = buildSnapshot(portfolio, funds);
    const record = await this.store.replaceActivePortfolioShare({
      userId: input.userId,
      portfolioId: input.portfolioId,
      shareCode: portfolio.shareCode,
      snapshotJson: JSON.stringify(snapshot),
      passwordHash,
      expiresAt,
    });

    if (this.cache) {
      try {
        await this.cache.set(toCacheValue(record));
      } catch (error) {
        this.logger?.warn(
          { err: error, shareCode: portfolio.shareCode },
          "failed to update share cache after share creation",
        );
      }
    }

    return {
      shareCode: portfolio.shareCode,
      expiresAt: record.expiresAt ?? null,
      hasPassword: Boolean(record.passwordHash),
    };
  }

  async importByShareCode(input: {
    userId: string;
    shareCode: string;
    password?: string;
  }): Promise<ImportPortfolioByShareCodeResult> {
    const normalizedShareCode = normalizeShareCode(input.shareCode);
    const record = await this.getActiveShareByCode(normalizedShareCode);
    if (!record) {
      throw new AppError(ERROR_CODES.SHARE_NOT_AVAILABLE, "share is unavailable", 404);
    }

    if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
      if (this.cache) {
        try {
          await this.cache.delete(normalizedShareCode);
        } catch (error) {
          this.logger?.warn({ err: error, shareCode: normalizedShareCode }, "failed to clear expired share cache");
        }
      }
      throw new AppError(ERROR_CODES.SHARE_NOT_AVAILABLE, "share is unavailable", 404);
    }

    if (record.passwordHash) {
      if (!input.password?.trim()) {
        throw new AppError(ERROR_CODES.SHARE_PASSWORD_REQUIRED, "share password is required", 400);
      }
      if (!verifyPassword(input.password, record.passwordHash)) {
        throw new AppError(ERROR_CODES.SHARE_PASSWORD_INVALID, "share password is invalid", 400);
      }
    }

    const snapshot = parseSnapshot(record.snapshotJson);
    const nextName = await this.getNextImportedPortfolioName(input.userId, snapshot.sourcePortfolioName);
    const createdPortfolio = await this.store.createPortfolio(input.userId, nextName, snapshot.portfolioType, 0);

    const dedupedFunds = Array.from(
      new Map(snapshot.funds.map((item) => [item.fundCode, item])).values(),
    );
    for (const fund of dedupedFunds) {
      const plannedRatio =
        createdPortfolio.type === "RATIO"
          ? Number((fund.plannedRatio ?? 0).toFixed(6))
          : undefined;
      await this.store.upsertPortfolioFund(input.userId, {
        portfolioId: createdPortfolio.id,
        fundCode: fund.fundCode,
        holdingAmount: 0,
        holdingProfitAmount: 0,
        plannedRatio,
      });
    }

    return {
      portfolio: toSummary(createdPortfolio, dedupedFunds.length),
      importedFundCount: dedupedFunds.length,
    };
  }

  private async getActiveShareByCode(shareCode: string): Promise<ShareCacheValue | undefined> {
    if (this.cache) {
      try {
        const cached = await this.cache.get(shareCode);
        if (cached && cached.status === "ACTIVE") {
          return cached;
        }
      } catch (error) {
        this.logger?.warn({ err: error, shareCode }, "failed to read share cache");
      }
    }

    const record = await this.store.getActivePortfolioShareByCode(shareCode);
    if (!record) {
      return undefined;
    }

    const cacheValue = toCacheValue(record);
    if (this.cache) {
      try {
        await this.cache.set(cacheValue);
      } catch (error) {
        this.logger?.warn({ err: error, shareCode }, "failed to write share cache");
      }
    }
    return cacheValue;
  }

  private async getNextImportedPortfolioName(userId: string, sourceName: string): Promise<string> {
    const existing = await this.store.listPortfolios(userId);
    const existingSet = new Set(existing.map((item) => item.name.toLowerCase()));
    const base = sourceName.trim() || "导入组合";

    for (let index = 1; index <= 999; index += 1) {
      const candidate = importedNameCandidate(base, index);
      if (!existingSet.has(candidate.toLowerCase())) {
        return candidate;
      }
    }

    return importedNameCandidate(base, Math.floor(Date.now() / 1000));
  }
}

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PortfolioType } from "@digmo/shared";

export interface PortfolioItem {
  id: string;
  name: string;
  type: PortfolioType;
  createdAt: string;
  updatedAt: string;
}

export interface FundStateItem {
  fundCode: string;
  totalChangePct: number;
  lastAccumulatedNavDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioFundItem {
  portfolioId: string;
  portfolioName: string;
  portfolioType: PortfolioType;
  fundCode: string;
  displayOrder: number;
  holdingAmount: number;
  holdingProfitAmount: number;
  plannedRatio?: number;
  lastHoldingRollNavDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPortfolioFundInput {
  portfolioId: string;
  fundCode: string;
  holdingAmount: number;
  holdingProfitAmount?: number;
  plannedRatio?: number;
}

export interface UpdatePortfolioFundInput {
  portfolioId: string;
  fundCode: string;
  holdingAmount?: number;
  holdingProfitAmount?: number;
  plannedRatio?: number;
}

export interface WatchlistStore {
  listPortfolios(): Promise<PortfolioItem[]>;
  getPortfolio(portfolioId: string): Promise<PortfolioItem | undefined>;
  createPortfolio(name: string, type: PortfolioType): Promise<PortfolioItem>;
  renamePortfolio(portfolioId: string, name: string): Promise<boolean>;
  deletePortfolio(portfolioId: string): Promise<boolean>;
  validatePortfolioSet(orderedPortfolioIds: string[]): Promise<boolean>;
  reorderPortfolios(orderedPortfolioIds: string[]): Promise<void>;

  listPortfolioFunds(portfolioId: string): Promise<PortfolioFundItem[]>;
  listAllPortfolioFunds(): Promise<PortfolioFundItem[]>;
  getPortfolioFund(portfolioId: string, fundCode: string): Promise<PortfolioFundItem | undefined>;
  upsertPortfolioFund(input: UpsertPortfolioFundInput): Promise<void>;
  updatePortfolioFund(input: UpdatePortfolioFundInput): Promise<boolean>;
  rollPortfolioFundHoldingByNavDate(fundCode: string, navDate: string, dailyReturn: number): Promise<number>;
  removePortfolioFund(portfolioId: string, fundCode: string): Promise<boolean>;
  reorderPortfolioFunds(portfolioId: string, orderedFundCodes: string[]): Promise<void>;
  validatePortfolioFundSet(portfolioId: string, orderedFundCodes: string[]): Promise<boolean>;
  sumPlannedRatio(portfolioId: string, excludeFundCode?: string): Promise<number>;

  listUniqueFundCodes(): Promise<string[]>;
  listFundStatesByCodes(fundCodes: string[]): Promise<Map<string, FundStateItem>>;
  ensureFundState(fundCode: string): Promise<void>;
  accumulateOfficialReturn(fundCode: string, navDate: string, dailyReturn: number): Promise<boolean>;
  cleanupOrphanFundStates(): Promise<void>;
}

interface SqliteRunResult {
  changes?: number | bigint;
}

interface LegacyWatchlistFundRow {
  fundCode: string;
  holdingAmount: number | null;
  totalChangePct: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastAccumulatedNavDate: string | null;
}

interface PortfolioRow {
  id: string;
  name: string;
  type: string;
  displayOrder: number | null;
  createdAt: string;
  updatedAt: string;
}

interface PortfolioFundRow {
  portfolioId: string;
  portfolioName: string;
  portfolioType: string;
  fundCode: string;
  displayOrder: number | null;
  holdingAmount: number | null;
  holdingProfitAmount: number | null;
  plannedRatio: number | null;
  lastHoldingRollNavDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FundStateRow {
  fundCode: string;
  totalChangePct: number | null;
  lastAccumulatedNavDate: string | null;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_PORTFOLIO_NAME = "默认组合";

function toPortfolioType(type: string): PortfolioType {
  return type === "RATIO" ? "RATIO" : "FREE";
}

function toChanges(result: SqliteRunResult): number {
  return typeof result.changes === "bigint" ? Number(result.changes) : (result.changes ?? 0);
}

export class SqliteWatchlistStore implements WatchlistStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");

    this.ensureLegacyTable();
    this.ensurePortfolioTables();
    this.migrateLegacyDataIfNeeded();
  }

  private ensureLegacyTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_watchlist_fund (
        fund_code TEXT PRIMARY KEY,
        holding_amount REAL NOT NULL DEFAULT 0,
        total_change_pct REAL NOT NULL DEFAULT 0,
        last_accumulated_nav_date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.ensureColumn("user_watchlist_fund", "holding_amount", "ALTER TABLE user_watchlist_fund ADD COLUMN holding_amount REAL NOT NULL DEFAULT 0;");
    this.ensureColumn(
      "user_watchlist_fund",
      "total_change_pct",
      "ALTER TABLE user_watchlist_fund ADD COLUMN total_change_pct REAL NOT NULL DEFAULT 0;"
    );
    this.ensureColumn(
      "user_watchlist_fund",
      "last_accumulated_nav_date",
      "ALTER TABLE user_watchlist_fund ADD COLUMN last_accumulated_nav_date TEXT;"
    );
    this.ensureColumn("user_watchlist_fund", "created_at", "ALTER TABLE user_watchlist_fund ADD COLUMN created_at TEXT;");
    this.ensureColumn("user_watchlist_fund", "updated_at", "ALTER TABLE user_watchlist_fund ADD COLUMN updated_at TEXT;");

    this.db.exec(`
      UPDATE user_watchlist_fund
      SET
        holding_amount = COALESCE(holding_amount, 0),
        total_change_pct = COALESCE(total_change_pct, 0),
        created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
        updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP);
    `);
  }

  private ensurePortfolioTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_portfolio (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('FREE', 'RATIO')),
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ux_user_portfolio_name_ci ON user_portfolio(name COLLATE NOCASE);

      CREATE TABLE IF NOT EXISTS user_fund_state (
        fund_code TEXT PRIMARY KEY,
        total_change_pct REAL NOT NULL DEFAULT 0,
        last_accumulated_nav_date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_portfolio_fund (
        portfolio_id TEXT NOT NULL,
        fund_code TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        holding_amount REAL NOT NULL DEFAULT 0,
        holding_profit_amount REAL NOT NULL DEFAULT 0,
        planned_ratio REAL,
        last_holding_roll_nav_date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (portfolio_id, fund_code),
        FOREIGN KEY (portfolio_id) REFERENCES user_portfolio(id) ON DELETE CASCADE,
        FOREIGN KEY (fund_code) REFERENCES user_fund_state(fund_code) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_portfolio_fund_portfolio_id ON user_portfolio_fund(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_user_portfolio_fund_fund_code ON user_portfolio_fund(fund_code);
    `);

    this.ensureColumn(
      "user_portfolio",
      "display_order",
      "ALTER TABLE user_portfolio ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;"
    );
    this.normalizePortfolioDisplayOrder();
    this.ensureColumn(
      "user_portfolio_fund",
      "display_order",
      "ALTER TABLE user_portfolio_fund ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;"
    );
    this.ensureColumn(
      "user_portfolio_fund",
      "holding_profit_amount",
      "ALTER TABLE user_portfolio_fund ADD COLUMN holding_profit_amount REAL NOT NULL DEFAULT 0;"
    );
    this.ensureColumn(
      "user_portfolio_fund",
      "last_holding_roll_nav_date",
      "ALTER TABLE user_portfolio_fund ADD COLUMN last_holding_roll_nav_date TEXT;"
    );
    this.db.exec(`
      UPDATE user_portfolio_fund
      SET holding_profit_amount = COALESCE(holding_profit_amount, 0);
    `);
    this.normalizePortfolioFundDisplayOrder();
  }

  private ensureColumn(tableName: string, name: string, alterSql: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    const exists = columns.some((column) => column.name === name);
    if (!exists) {
      this.db.exec(alterSql);
    }
  }

  private normalizePortfolioFundDisplayOrder(): void {
    const hasDuplicateOrder = this.db
      .prepare(
        `
          SELECT 1
          FROM user_portfolio_fund
          GROUP BY portfolio_id, display_order
          HAVING COUNT(1) > 1
          LIMIT 1
        `
      )
      .get();

    if (!hasDuplicateOrder) {
      return;
    }

    this.db.exec(`
      WITH ranked AS (
        SELECT
          rowid AS rid,
          ROW_NUMBER() OVER (
            PARTITION BY portfolio_id
            ORDER BY created_at DESC, rowid DESC
          ) - 1 AS next_order
        FROM user_portfolio_fund
      )
      UPDATE user_portfolio_fund
      SET display_order = (
        SELECT ranked.next_order
        FROM ranked
        WHERE ranked.rid = user_portfolio_fund.rowid
      );
    `);
  }

  private normalizePortfolioDisplayOrder(): void {
    const hasDuplicateOrder = this.db
      .prepare(
        `
          SELECT 1
          FROM user_portfolio
          GROUP BY display_order
          HAVING COUNT(1) > 1
          LIMIT 1
        `
      )
      .get();

    if (!hasDuplicateOrder) {
      return;
    }

    this.db.exec(`
      WITH ranked AS (
        SELECT
          rowid AS rid,
          ROW_NUMBER() OVER (
            ORDER BY created_at DESC, rowid DESC
          ) - 1 AS next_order
        FROM user_portfolio
      )
      UPDATE user_portfolio
      SET display_order = (
        SELECT ranked.next_order
        FROM ranked
        WHERE ranked.rid = user_portfolio.rowid
      );
    `);
  }

  private migrateLegacyDataIfNeeded(): void {
    const portfolioCountRow = this.db.prepare("SELECT COUNT(1) AS count FROM user_portfolio").get() as { count: number } | undefined;
    const portfolioCount = portfolioCountRow?.count ?? 0;
    if (portfolioCount > 0) {
      return;
    }

    const legacyCountRow = this.db.prepare("SELECT COUNT(1) AS count FROM user_watchlist_fund").get() as { count: number } | undefined;
    const legacyCount = legacyCountRow?.count ?? 0;
    if (legacyCount === 0) {
      return;
    }

    const legacyRows = this.db
      .prepare(
        `
          SELECT
            fund_code AS fundCode,
            holding_amount AS holdingAmount,
            total_change_pct AS totalChangePct,
            created_at AS createdAt,
            updated_at AS updatedAt,
            last_accumulated_nav_date AS lastAccumulatedNavDate
          FROM user_watchlist_fund
          ORDER BY created_at DESC, rowid DESC
        `
      )
      .all() as LegacyWatchlistFundRow[];

    if (legacyRows.length === 0) {
      return;
    }

    const portfolioId = randomUUID();

    this.db.exec("BEGIN TRANSACTION;");
    try {
      this.db
        .prepare(
          `
            INSERT INTO user_portfolio (id, name, type, display_order, created_at, updated_at)
            VALUES (?, ?, 'FREE', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `
        )
        .run(portfolioId, DEFAULT_PORTFOLIO_NAME);

      const insertFundStateStmt = this.db.prepare(
        `
          INSERT INTO user_fund_state (fund_code, total_change_pct, last_accumulated_nav_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(fund_code) DO UPDATE SET
            total_change_pct = excluded.total_change_pct,
            last_accumulated_nav_date = excluded.last_accumulated_nav_date,
            updated_at = excluded.updated_at
        `
      );

      const insertPortfolioFundStmt = this.db.prepare(
        `
          INSERT INTO user_portfolio_fund (
            portfolio_id,
            fund_code,
            display_order,
            holding_amount,
            planned_ratio,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, NULL, ?, ?)
          ON CONFLICT(portfolio_id, fund_code) DO UPDATE SET
            holding_amount = excluded.holding_amount,
            planned_ratio = NULL,
            updated_at = excluded.updated_at
        `
      );

      for (const [index, row] of legacyRows.entries()) {
        const createdAt = row.createdAt ?? new Date().toISOString();
        const updatedAt = row.updatedAt ?? createdAt;
        insertFundStateStmt.run(
          row.fundCode,
          Number((row.totalChangePct ?? 0).toFixed(6)),
          row.lastAccumulatedNavDate,
          createdAt,
          updatedAt
        );
        insertPortfolioFundStmt.run(
          portfolioId,
          row.fundCode,
          index,
          Number((row.holdingAmount ?? 0).toFixed(2)),
          createdAt,
          updatedAt
        );
      }

      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  async listPortfolios(): Promise<PortfolioItem[]> {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            name,
            type,
            display_order AS displayOrder,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM user_portfolio
          ORDER BY display_order ASC, updated_at DESC
        `
      )
      .all() as PortfolioRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: toPortfolioType(row.type),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
  }

  async getPortfolio(portfolioId: string): Promise<PortfolioItem | undefined> {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            name,
            type,
            display_order AS displayOrder,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM user_portfolio
          WHERE id = ?
        `
      )
      .get(portfolioId) as PortfolioRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      name: row.name,
      type: toPortfolioType(row.type),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  async createPortfolio(name: string, type: PortfolioType): Promise<PortfolioItem> {
    const id = randomUUID();
    const row = this.db
      .prepare(
        `
          SELECT COALESCE(MAX(display_order), -1) AS maxDisplayOrder
          FROM user_portfolio
        `
      )
      .get() as { maxDisplayOrder: number | null } | undefined;
    const nextDisplayOrder = (row?.maxDisplayOrder ?? -1) + 1;
    this.db
      .prepare(
        `
          INSERT INTO user_portfolio (id, name, type, display_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `
      )
      .run(id, name, type, nextDisplayOrder);

    const created = await this.getPortfolio(id);
    if (!created) {
      throw new Error("failed to create portfolio");
    }
    return created;
  }

  async renamePortfolio(portfolioId: string, name: string): Promise<boolean> {
    const result = this.db
      .prepare(
        `
          UPDATE user_portfolio
          SET name = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `
      )
      .run(name, portfolioId) as SqliteRunResult;

    return toChanges(result) > 0;
  }

  async deletePortfolio(portfolioId: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM user_portfolio WHERE id = ?").run(portfolioId) as SqliteRunResult;
    const removed = toChanges(result) > 0;
    if (removed) {
      await this.cleanupOrphanFundStates();
    }
    return removed;
  }

  async validatePortfolioSet(orderedPortfolioIds: string[]): Promise<boolean> {
    const rows = this.db
      .prepare(
        `
          SELECT id
          FROM user_portfolio
        `
      )
      .all() as Array<{ id: string }>;

    if (rows.length !== orderedPortfolioIds.length) {
      return false;
    }

    const inputSet = new Set(orderedPortfolioIds);
    if (inputSet.size !== orderedPortfolioIds.length) {
      return false;
    }

    const existingSet = new Set(rows.map((row) => row.id));
    if (existingSet.size !== rows.length) {
      return false;
    }

    for (const portfolioId of orderedPortfolioIds) {
      if (!existingSet.has(portfolioId)) {
        return false;
      }
    }

    return true;
  }

  async reorderPortfolios(orderedPortfolioIds: string[]): Promise<void> {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const updateStmt = this.db.prepare(
        `
          UPDATE user_portfolio
          SET display_order = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `
      );

      for (const [index, portfolioId] of orderedPortfolioIds.entries()) {
        const result = updateStmt.run(index, portfolioId) as SqliteRunResult;
        if (toChanges(result) === 0) {
          throw new Error(`portfolio ${portfolioId} is not found`);
        }
      }

      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  async listPortfolioFunds(portfolioId: string): Promise<PortfolioFundItem[]> {
    const rows = this.db
      .prepare(
        `
          SELECT
            pf.portfolio_id AS portfolioId,
            p.name AS portfolioName,
            p.type AS portfolioType,
            pf.fund_code AS fundCode,
            pf.display_order AS displayOrder,
            pf.holding_amount AS holdingAmount,
            pf.holding_profit_amount AS holdingProfitAmount,
            pf.planned_ratio AS plannedRatio,
            pf.last_holding_roll_nav_date AS lastHoldingRollNavDate,
            pf.created_at AS createdAt,
            pf.updated_at AS updatedAt
          FROM user_portfolio_fund pf
          JOIN user_portfolio p ON p.id = pf.portfolio_id
          WHERE pf.portfolio_id = ?
          ORDER BY pf.display_order ASC, pf.updated_at DESC
        `
      )
      .all(portfolioId) as PortfolioFundRow[];

    return rows.map((row) => ({
      portfolioId: row.portfolioId,
      portfolioName: row.portfolioName,
      portfolioType: toPortfolioType(row.portfolioType),
      fundCode: row.fundCode,
      displayOrder: row.displayOrder ?? 0,
      holdingAmount: Number((row.holdingAmount ?? 0).toFixed(2)),
      holdingProfitAmount: Number((row.holdingProfitAmount ?? 0).toFixed(2)),
      plannedRatio: typeof row.plannedRatio === "number" ? Number(row.plannedRatio.toFixed(6)) : undefined,
      lastHoldingRollNavDate: row.lastHoldingRollNavDate ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
  }

  async listAllPortfolioFunds(): Promise<PortfolioFundItem[]> {
    const rows = this.db
      .prepare(
        `
          SELECT
            pf.portfolio_id AS portfolioId,
            p.name AS portfolioName,
            p.type AS portfolioType,
            pf.fund_code AS fundCode,
            pf.display_order AS displayOrder,
            pf.holding_amount AS holdingAmount,
            pf.holding_profit_amount AS holdingProfitAmount,
            pf.planned_ratio AS plannedRatio,
            pf.last_holding_roll_nav_date AS lastHoldingRollNavDate,
            pf.created_at AS createdAt,
            pf.updated_at AS updatedAt
          FROM user_portfolio_fund pf
          JOIN user_portfolio p ON p.id = pf.portfolio_id
          ORDER BY pf.created_at DESC, pf.rowid DESC
        `
      )
      .all() as PortfolioFundRow[];

    return rows.map((row) => ({
      portfolioId: row.portfolioId,
      portfolioName: row.portfolioName,
      portfolioType: toPortfolioType(row.portfolioType),
      fundCode: row.fundCode,
      displayOrder: row.displayOrder ?? 0,
      holdingAmount: Number((row.holdingAmount ?? 0).toFixed(2)),
      holdingProfitAmount: Number((row.holdingProfitAmount ?? 0).toFixed(2)),
      plannedRatio: typeof row.plannedRatio === "number" ? Number(row.plannedRatio.toFixed(6)) : undefined,
      lastHoldingRollNavDate: row.lastHoldingRollNavDate ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
  }

  async getPortfolioFund(portfolioId: string, fundCode: string): Promise<PortfolioFundItem | undefined> {
    const row = this.db
      .prepare(
        `
          SELECT
            pf.portfolio_id AS portfolioId,
            p.name AS portfolioName,
            p.type AS portfolioType,
            pf.fund_code AS fundCode,
            pf.display_order AS displayOrder,
            pf.holding_amount AS holdingAmount,
            pf.holding_profit_amount AS holdingProfitAmount,
            pf.planned_ratio AS plannedRatio,
            pf.last_holding_roll_nav_date AS lastHoldingRollNavDate,
            pf.created_at AS createdAt,
            pf.updated_at AS updatedAt
          FROM user_portfolio_fund pf
          JOIN user_portfolio p ON p.id = pf.portfolio_id
          WHERE pf.portfolio_id = ? AND pf.fund_code = ?
        `
      )
      .get(portfolioId, fundCode) as PortfolioFundRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      portfolioId: row.portfolioId,
      portfolioName: row.portfolioName,
      portfolioType: toPortfolioType(row.portfolioType),
      fundCode: row.fundCode,
      displayOrder: row.displayOrder ?? 0,
      holdingAmount: Number((row.holdingAmount ?? 0).toFixed(2)),
      holdingProfitAmount: Number((row.holdingProfitAmount ?? 0).toFixed(2)),
      plannedRatio: typeof row.plannedRatio === "number" ? Number(row.plannedRatio.toFixed(6)) : undefined,
      lastHoldingRollNavDate: row.lastHoldingRollNavDate ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private async getNextDisplayOrder(portfolioId: string): Promise<number> {
    const row = this.db
      .prepare(
        `
          SELECT COALESCE(MAX(display_order), -1) AS maxDisplayOrder
          FROM user_portfolio_fund
          WHERE portfolio_id = ?
        `
      )
      .get(portfolioId) as { maxDisplayOrder: number | null } | undefined;

    return (row?.maxDisplayOrder ?? -1) + 1;
  }

  async upsertPortfolioFund(input: UpsertPortfolioFundInput): Promise<void> {
    await this.ensureFundState(input.fundCode);
    const nextDisplayOrder = await this.getNextDisplayOrder(input.portfolioId);
    const holdingProfitAmount = typeof input.holdingProfitAmount === "number" ? input.holdingProfitAmount : null;

    this.db
      .prepare(
        `
          INSERT INTO user_portfolio_fund (
            portfolio_id,
            fund_code,
            display_order,
            holding_amount,
            holding_profit_amount,
            planned_ratio,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, COALESCE(?, 0), ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(portfolio_id, fund_code) DO UPDATE SET
            holding_amount = excluded.holding_amount,
            holding_profit_amount = CASE
              WHEN ? IS NULL THEN user_portfolio_fund.holding_profit_amount
              ELSE ?
            END,
            planned_ratio = excluded.planned_ratio,
            updated_at = CURRENT_TIMESTAMP
        `
      )
      .run(
        input.portfolioId,
        input.fundCode,
        nextDisplayOrder,
        input.holdingAmount,
        holdingProfitAmount,
        input.plannedRatio ?? null,
        holdingProfitAmount,
        holdingProfitAmount
      );
  }

  async updatePortfolioFund(input: UpdatePortfolioFundInput): Promise<boolean> {
    const current = await this.getPortfolioFund(input.portfolioId, input.fundCode);
    if (!current) {
      return false;
    }

    const nextHoldingAmount = typeof input.holdingAmount === "number" ? input.holdingAmount : current.holdingAmount;
    const nextHoldingProfitAmount =
      typeof input.holdingProfitAmount === "number" ? input.holdingProfitAmount : current.holdingProfitAmount;
    const nextPlannedRatio = input.plannedRatio === undefined ? current.plannedRatio : input.plannedRatio;

    this.db
      .prepare(
        `
          UPDATE user_portfolio_fund
          SET
            holding_amount = ?,
            holding_profit_amount = ?,
            planned_ratio = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE portfolio_id = ? AND fund_code = ?
        `
      )
      .run(nextHoldingAmount, nextHoldingProfitAmount, nextPlannedRatio ?? null, input.portfolioId, input.fundCode);

    return true;
  }

  async rollPortfolioFundHoldingByNavDate(fundCode: string, navDate: string, dailyReturn: number): Promise<number> {
    const result = this.db
      .prepare(
        `
          UPDATE user_portfolio_fund
          SET
            holding_profit_amount = ROUND(COALESCE(holding_profit_amount, 0) + ROUND(COALESCE(holding_amount, 0) * ?, 2), 2),
            holding_amount = ROUND(COALESCE(holding_amount, 0) + ROUND(COALESCE(holding_amount, 0) * ?, 2), 2),
            last_holding_roll_nav_date = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE
            fund_code = ?
            AND (last_holding_roll_nav_date IS NULL OR last_holding_roll_nav_date <> ?)
        `
      )
      .run(dailyReturn, dailyReturn, navDate, fundCode, navDate) as SqliteRunResult;

    return toChanges(result);
  }

  async removePortfolioFund(portfolioId: string, fundCode: string): Promise<boolean> {
    const result = this.db
      .prepare("DELETE FROM user_portfolio_fund WHERE portfolio_id = ? AND fund_code = ?")
      .run(portfolioId, fundCode) as SqliteRunResult;

    const removed = toChanges(result) > 0;
    if (removed) {
      await this.cleanupOrphanFundStates();
    }
    return removed;
  }

  async validatePortfolioFundSet(portfolioId: string, orderedFundCodes: string[]): Promise<boolean> {
    const rows = this.db
      .prepare(
        `
          SELECT fund_code AS fundCode
          FROM user_portfolio_fund
          WHERE portfolio_id = ?
        `
      )
      .all(portfolioId) as Array<{ fundCode: string }>;

    if (rows.length !== orderedFundCodes.length) {
      return false;
    }

    const inputSet = new Set(orderedFundCodes);
    if (inputSet.size !== orderedFundCodes.length) {
      return false;
    }

    const existingSet = new Set(rows.map((row) => row.fundCode));
    if (existingSet.size !== rows.length) {
      return false;
    }

    for (const fundCode of orderedFundCodes) {
      if (!existingSet.has(fundCode)) {
        return false;
      }
    }

    return true;
  }

  async reorderPortfolioFunds(portfolioId: string, orderedFundCodes: string[]): Promise<void> {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const updateStmt = this.db.prepare(
        `
          UPDATE user_portfolio_fund
          SET display_order = ?, updated_at = CURRENT_TIMESTAMP
          WHERE portfolio_id = ? AND fund_code = ?
        `
      );

      for (const [index, fundCode] of orderedFundCodes.entries()) {
        const result = updateStmt.run(index, portfolioId, fundCode) as SqliteRunResult;
        if (toChanges(result) === 0) {
          throw new Error(`fund ${fundCode} is not found in portfolio ${portfolioId}`);
        }
      }

      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  async sumPlannedRatio(portfolioId: string, excludeFundCode?: string): Promise<number> {
    if (excludeFundCode) {
      const row = this.db
        .prepare(
          `
            SELECT COALESCE(SUM(COALESCE(planned_ratio, 0)), 0) AS sumRatio
            FROM user_portfolio_fund
            WHERE portfolio_id = ? AND fund_code <> ?
          `
        )
        .get(portfolioId, excludeFundCode) as { sumRatio: number | null } | undefined;

      return Number((row?.sumRatio ?? 0).toFixed(6));
    }

    const row = this.db
      .prepare(
        `
          SELECT COALESCE(SUM(COALESCE(planned_ratio, 0)), 0) AS sumRatio
          FROM user_portfolio_fund
          WHERE portfolio_id = ?
        `
      )
      .get(portfolioId) as { sumRatio: number | null } | undefined;

    return Number((row?.sumRatio ?? 0).toFixed(6));
  }

  async listUniqueFundCodes(): Promise<string[]> {
    const rows = this.db
      .prepare(
        `
          SELECT DISTINCT fund_code AS fundCode
          FROM user_portfolio_fund
          ORDER BY fund_code ASC
        `
      )
      .all() as Array<{ fundCode: string }>;

    return rows.map((row) => row.fundCode);
  }

  async listFundStatesByCodes(fundCodes: string[]): Promise<Map<string, FundStateItem>> {
    if (fundCodes.length === 0) {
      return new Map();
    }

    const placeholders = fundCodes.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
          SELECT
            fund_code AS fundCode,
            total_change_pct AS totalChangePct,
            last_accumulated_nav_date AS lastAccumulatedNavDate,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM user_fund_state
          WHERE fund_code IN (${placeholders})
        `
      )
      .all(...fundCodes) as FundStateRow[];

    return new Map(
      rows.map((row) => [
        row.fundCode,
        {
          fundCode: row.fundCode,
          totalChangePct: Number((row.totalChangePct ?? 0).toFixed(6)),
          lastAccumulatedNavDate: row.lastAccumulatedNavDate ?? undefined,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        }
      ])
    );
  }

  async ensureFundState(fundCode: string): Promise<void> {
    this.db
      .prepare(
        `
          INSERT INTO user_fund_state (fund_code, total_change_pct, last_accumulated_nav_date, created_at, updated_at)
          VALUES (?, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(fund_code) DO NOTHING
        `
      )
      .run(fundCode);
  }

  async accumulateOfficialReturn(fundCode: string, navDate: string, dailyReturn: number): Promise<boolean> {
    if (!navDate || !Number.isFinite(dailyReturn)) {
      return false;
    }

    const result = this.db
      .prepare(
        `
          UPDATE user_fund_state
          SET
            total_change_pct = ROUND(COALESCE(total_change_pct, 0) + ?, 6),
            last_accumulated_nav_date = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE
            fund_code = ?
            AND (last_accumulated_nav_date IS NULL OR last_accumulated_nav_date <> ?)
        `
      )
      .run(dailyReturn, navDate, fundCode, navDate) as SqliteRunResult;

    return toChanges(result) > 0;
  }

  async cleanupOrphanFundStates(): Promise<void> {
    this.db.exec(`
      DELETE FROM user_fund_state
      WHERE fund_code NOT IN (
        SELECT DISTINCT fund_code FROM user_portfolio_fund
      );
    `);
  }
}

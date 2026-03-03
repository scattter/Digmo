import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface WatchlistFundItem {
  fundCode: string;
  holdingAmount: number;
  totalChangePct: number;
  createdAt: string;
  lastAccumulatedNavDate?: string;
}

export interface WatchlistStore {
  listFunds(): Promise<WatchlistFundItem[]>;
  addFund(fundCode: string, holdingAmount?: number): Promise<void>;
  updateHoldingAmount(fundCode: string, holdingAmount: number): Promise<boolean>;
  accumulateOfficialReturn(fundCode: string, navDate: string, dailyReturn: number): Promise<boolean>;
  setOfficialReturnAnchor(fundCode: string, navDate: string, dailyReturn: number): Promise<boolean>;
  removeFundCode(fundCode: string): Promise<boolean>;
}

interface SqliteRunResult {
  changes?: number | bigint;
}

interface WatchlistFundRow {
  fundCode: string;
  holdingAmount: number | null;
  totalChangePct: number | null;
  createdAt: string;
  lastAccumulatedNavDate: string | null;
}

export class SqliteWatchlistStore implements WatchlistStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
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

    this.ensureColumn("holding_amount", "ALTER TABLE user_watchlist_fund ADD COLUMN holding_amount REAL NOT NULL DEFAULT 0;");
    this.ensureColumn("total_change_pct", "ALTER TABLE user_watchlist_fund ADD COLUMN total_change_pct REAL NOT NULL DEFAULT 0;");
    this.ensureColumn(
      "last_accumulated_nav_date",
      "ALTER TABLE user_watchlist_fund ADD COLUMN last_accumulated_nav_date TEXT;"
    );
    this.ensureColumn("created_at", "ALTER TABLE user_watchlist_fund ADD COLUMN created_at TEXT;");
    this.ensureColumn("updated_at", "ALTER TABLE user_watchlist_fund ADD COLUMN updated_at TEXT;");

    this.db.exec(`
      UPDATE user_watchlist_fund
      SET
        holding_amount = COALESCE(holding_amount, 0),
        total_change_pct = COALESCE(total_change_pct, 0),
        created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
        updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP);
    `);
  }

  private ensureColumn(name: string, alterSql: string): void {
    const columns = this.db.prepare("PRAGMA table_info(user_watchlist_fund)").all() as Array<{ name: string }>;
    const exists = columns.some((column) => column.name === name);
    if (!exists) {
      this.db.exec(alterSql);
    }
  }

  async listFunds(): Promise<WatchlistFundItem[]> {
    const rows = this.db
      .prepare(
        `
          SELECT
            fund_code AS fundCode,
            holding_amount AS holdingAmount,
            total_change_pct AS totalChangePct,
            created_at AS createdAt,
            last_accumulated_nav_date AS lastAccumulatedNavDate
          FROM user_watchlist_fund
          ORDER BY created_at DESC, rowid DESC
        `
      )
      .all() as WatchlistFundRow[];

    return rows.map((row) => ({
      fundCode: row.fundCode,
      holdingAmount: Number((row.holdingAmount ?? 0).toFixed(2)),
      totalChangePct: Number((row.totalChangePct ?? 0).toFixed(6)),
      createdAt: row.createdAt,
      lastAccumulatedNavDate: row.lastAccumulatedNavDate ?? undefined
    }));
  }

  async addFund(fundCode: string, holdingAmount?: number): Promise<void> {
    if (typeof holdingAmount === "number") {
      this.db
        .prepare(
          `
            INSERT INTO user_watchlist_fund (
              fund_code,
              holding_amount,
              total_change_pct,
              last_accumulated_nav_date,
              created_at,
              updated_at
            )
            VALUES (?, ?, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(fund_code) DO UPDATE SET
              holding_amount = excluded.holding_amount,
              updated_at = CURRENT_TIMESTAMP
          `
        )
        .run(fundCode, holdingAmount);
      return;
    }

    this.db
      .prepare(
        `
          INSERT INTO user_watchlist_fund (
            fund_code,
            holding_amount,
            total_change_pct,
            last_accumulated_nav_date,
            created_at,
            updated_at
          )
          VALUES (?, 0, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(fund_code) DO NOTHING
        `
      )
      .run(fundCode);
  }

  async updateHoldingAmount(fundCode: string, holdingAmount: number): Promise<boolean> {
    const result = this.db
      .prepare(
        `
          UPDATE user_watchlist_fund
          SET holding_amount = ?, updated_at = CURRENT_TIMESTAMP
          WHERE fund_code = ?
        `
      )
      .run(holdingAmount, fundCode) as SqliteRunResult;

    const changes = typeof result.changes === "bigint" ? Number(result.changes) : (result.changes ?? 0);
    return changes > 0;
  }

  async accumulateOfficialReturn(fundCode: string, navDate: string, dailyReturn: number): Promise<boolean> {
    if (!navDate || !Number.isFinite(dailyReturn)) {
      return false;
    }

    const result = this.db
      .prepare(
        `
          UPDATE user_watchlist_fund
          SET
            total_change_pct = ROUND(COALESCE(total_change_pct, 0) + ?, 6),
            last_accumulated_nav_date = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE
            fund_code = ?
            AND (last_accumulated_nav_date IS NULL OR last_accumulated_nav_date <> ?)
            AND date(created_at) <= date(?)
        `
      )
      .run(dailyReturn, navDate, fundCode, navDate, navDate) as SqliteRunResult;

    const changes = typeof result.changes === "bigint" ? Number(result.changes) : (result.changes ?? 0);
    return changes > 0;
  }

  async setOfficialReturnAnchor(fundCode: string, navDate: string, dailyReturn: number): Promise<boolean> {
    if (!navDate || !Number.isFinite(dailyReturn)) {
      return false;
    }

    const result = this.db
      .prepare(
        `
          UPDATE user_watchlist_fund
          SET
            total_change_pct = ROUND(?, 6),
            last_accumulated_nav_date = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE fund_code = ?
        `
      )
      .run(dailyReturn, navDate, fundCode) as SqliteRunResult;

    const changes = typeof result.changes === "bigint" ? Number(result.changes) : (result.changes ?? 0);
    return changes > 0;
  }

  async removeFundCode(fundCode: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM user_watchlist_fund WHERE fund_code = ?").run(fundCode) as SqliteRunResult;
    const changes = typeof result.changes === "bigint" ? Number(result.changes) : (result.changes ?? 0);
    return changes > 0;
  }
}

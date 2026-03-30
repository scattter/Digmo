import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  DecisionAiMode,
  PortfolioType,
  PositionOperationType,
  UserDecisionAiConfigSummary,
  UserRole,
  UserStatus,
} from "@digmo/shared";
import { hashPassword } from "../../modules/auth/password.js";
import { getNextWorkingDaySettlementTime, isSettlementDue } from "../../utils/time.js";

export interface PortfolioItem {
  id: string;
  name: string;
  type: PortfolioType;
  shareCode: string;
  totalAsset: number;
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

export interface PortfolioTabLayoutPreference {
  fundsTabIndex: number;
}

export interface UserDecisionAiConfigItem extends UserDecisionAiConfigSummary {
  userId: string;
  apiKey: string;
  createdAt: string;
}

export interface AppUserItem {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AppUserWithPasswordItem extends AppUserItem {
  passwordHash: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role: UserRole;
  status?: UserStatus;
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

export interface PositionOperationInput {
  portfolioId: string;
  fundCode: string;
  operationType: PositionOperationType;
  amount: number;
}

export interface PositionOperationItem {
  id: string;
  portfolioId: string;
  fundCode: string;
  operationType: PositionOperationType;
  amount: number;
  beforeHoldingAmount: number;
  afterHoldingAmount: number;
  beforeHoldingProfitAmount: number;
  afterHoldingProfitAmount: number;
  status: "PENDING" | "APPLIED";
  effectiveAt: string;
  appliedAt?: string;
  manualCanceledAt?: string;
  createdAt: string;
}

export interface DeletePositionOperationResult {
  effect: "REMOVED" | "MARKED_MANUAL_CANCEL";
  operation?: PositionOperationItem;
}

export interface PortfolioShareRecord {
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

export interface ExportDataPayload {
  meta: {
    version: number;
    exportedAt: string;
  };
  users: Array<{
    id: string;
    username: string;
    passwordHash: string;
    role: UserRole;
    status: UserStatus;
    createdAt: string;
    updatedAt: string;
  }>;
  portfolios: Array<{
    userId: string;
    id: string;
    name: string;
    type: PortfolioType;
    shareCode: string;
    totalAsset?: number;
    displayOrder: number;
    createdAt: string;
    updatedAt: string;
  }>;
  fundStates: Array<{
    userId: string;
    fundCode: string;
    totalChangePct: number;
    lastAccumulatedNavDate?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  portfolioFunds: Array<{
    userId: string;
    portfolioId: string;
    fundCode: string;
    displayOrder: number;
    holdingAmount: number;
    holdingProfitAmount: number;
    plannedRatio?: number;
    lastHoldingRollNavDate?: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface WatchlistStore {
  listPortfolios(userId: string): Promise<PortfolioItem[]>;
  getPortfolio(userId: string, portfolioId: string): Promise<PortfolioItem | undefined>;
  createPortfolio(userId: string, name: string, type: PortfolioType, totalAsset?: number): Promise<PortfolioItem>;
  updatePortfolio(
    userId: string,
    portfolioId: string,
    input: { name?: string; totalAsset?: number }
  ): Promise<boolean>;
  deletePortfolio(userId: string, portfolioId: string): Promise<boolean>;
  validatePortfolioSet(userId: string, orderedPortfolioIds: string[]): Promise<boolean>;
  reorderPortfolios(userId: string, orderedPortfolioIds: string[]): Promise<void>;
  getPortfolioTabLayoutPreference(userId: string): Promise<PortfolioTabLayoutPreference>;
  setPortfolioTabLayoutPreference(userId: string, preference: PortfolioTabLayoutPreference): Promise<void>;
  getDecisionAiConfig(userId: string): Promise<UserDecisionAiConfigItem | undefined>;
  upsertDecisionAiConfig(
    userId: string,
    input: { baseUrl: string; model: string; mode: DecisionAiMode; apiKey: string }
  ): Promise<UserDecisionAiConfigItem>;

  listPortfolioFunds(userId: string, portfolioId: string): Promise<PortfolioFundItem[]>;
  listAllPortfolioFunds(userId: string): Promise<PortfolioFundItem[]>;
  getPortfolioFund(userId: string, portfolioId: string, fundCode: string): Promise<PortfolioFundItem | undefined>;
  upsertPortfolioFund(userId: string, input: UpsertPortfolioFundInput): Promise<void>;
  updatePortfolioFund(userId: string, input: UpdatePortfolioFundInput): Promise<boolean>;
  applyPositionOperation(userId: string, input: PositionOperationInput): Promise<PositionOperationItem | undefined>;
  deletePositionOperation(
    userId: string,
    portfolioId: string,
    fundCode: string,
    operationId: string
  ): Promise<DeletePositionOperationResult | undefined>;
  listPositionOperations(
    userId: string,
    portfolioId: string,
    options?: { limit?: number; fundCode?: string }
  ): Promise<PositionOperationItem[]>;
  rollPortfolioFundHoldingByNavDate(userId: string, fundCode: string, navDate: string, dailyReturn: number): Promise<number>;
  removePortfolioFund(userId: string, portfolioId: string, fundCode: string): Promise<boolean>;
  reorderPortfolioFunds(userId: string, portfolioId: string, orderedFundCodes: string[]): Promise<void>;
  validatePortfolioFundSet(userId: string, portfolioId: string, orderedFundCodes: string[]): Promise<boolean>;
  sumPlannedRatio(userId: string, portfolioId: string, excludeFundCode?: string): Promise<number>;

  listUniqueFundCodes(userId: string): Promise<string[]>;
  listFundStatesByCodes(userId: string, fundCodes: string[]): Promise<Map<string, FundStateItem>>;
  ensureFundState(userId: string, fundCode: string): Promise<void>;
  accumulateOfficialReturn(userId: string, fundCode: string, navDate: string, dailyReturn: number): Promise<boolean>;
  cleanupOrphanFundStates(userId: string): Promise<void>;

  getActivePortfolioShareByCode(shareCode: string): Promise<PortfolioShareRecord | undefined>;
  replaceActivePortfolioShare(input: {
    userId: string;
    portfolioId: string;
    shareCode: string;
    snapshotJson: string;
    passwordHash?: string;
    expiresAt?: string;
  }): Promise<PortfolioShareRecord>;
}

export interface SqliteWatchlistStoreOptions {
  bootstrapAdminUsername?: string;
  bootstrapAdminPassword?: string;
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

interface AppUserRow {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface PortfolioRow {
  userId: string;
  id: string;
  name: string;
  type: string;
  shareCode: string | null;
  totalAsset: number | null;
  displayOrder: number | null;
  createdAt: string;
  updatedAt: string;
}

interface PortfolioShareRow {
  id: string;
  userId: string;
  portfolioId: string;
  shareCode: string;
  status: "ACTIVE" | "INACTIVE";
  snapshotJson: string;
  passwordHash: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PortfolioTabLayoutPreferenceRow {
  userId: string;
  fundsTabIndex: number | null;
}

interface UserDecisionAiConfigRow {
  userId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  mode: DecisionAiMode;
  createdAt: string;
  updatedAt: string;
}

interface PortfolioFundRow {
  userId: string;
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
  userId: string;
  fundCode: string;
  totalChangePct: number | null;
  lastAccumulatedNavDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PositionOperationRow {
  id: string;
  userId?: string;
  portfolioId: string;
  fundCode: string;
  operationType: PositionOperationType;
  amount: number;
  beforeHoldingAmount: number;
  afterHoldingAmount: number;
  beforeHoldingProfitAmount: number;
  afterHoldingProfitAmount: number;
  bindDecisionId: string | null;
  bindActionOrder: number | null;
  bindActionType: "BUY" | "SELL" | "HOLD" | "REBALANCE" | null;
  bindActionFundCode: string | null;
  bindActionFundName: string | null;
  bindActionRiskLevel: "LOW" | "MEDIUM" | "HIGH" | null;
  bindActionRationale: string | null;
  status: "PENDING" | "APPLIED";
  effectiveAt: string | null;
  appliedAt: string | null;
  deletedAt: string | null;
  manualCanceledAt: string | null;
  createdAt: string;
}

const DEFAULT_PORTFOLIO_NAME = "默认组合";
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin123456";
const SHARE_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SHARE_CODE_LENGTH = 8;

function toPortfolioType(type: string): PortfolioType {
  return type === "RATIO" ? "RATIO" : "FREE";
}

function toUserRole(role: string): UserRole {
  return role === "admin" ? "admin" : "user";
}

function toUserStatus(status: string): UserStatus {
  return status === "disabled" ? "disabled" : "active";
}

function toChanges(result: SqliteRunResult): number {
  return typeof result.changes === "bigint" ? Number(result.changes) : (result.changes ?? 0);
}

function toIsoLike(value: string | null | undefined): string {
  return value ?? new Date().toISOString();
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function computeOperationSnapshot(input: {
  beforeHoldingAmount: number;
  beforeHoldingProfitAmount: number;
  operationType: PositionOperationType;
  amount: number;
}): {
  beforeHoldingAmount: number;
  afterHoldingAmount: number;
  beforeHoldingProfitAmount: number;
  afterHoldingProfitAmount: number;
} {
  const beforeHoldingAmount = roundCurrency(input.beforeHoldingAmount);
  const beforeHoldingProfitAmount = roundCurrency(input.beforeHoldingProfitAmount);
  const amount = roundCurrency(input.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be greater than 0");
  }

  if (input.operationType === "DECREASE" && amount > beforeHoldingAmount) {
    throw new Error("decrease amount exceeds current holding amount");
  }

  const afterHoldingAmount = roundCurrency(
    input.operationType === "INCREASE" ? beforeHoldingAmount + amount : beforeHoldingAmount - amount
  );
  const afterHoldingProfitAmount = roundCurrency(
    input.operationType === "INCREASE"
      ? beforeHoldingProfitAmount
      : beforeHoldingAmount > 0
        ? beforeHoldingProfitAmount * (afterHoldingAmount / beforeHoldingAmount)
        : 0
  );

  return {
    beforeHoldingAmount,
    afterHoldingAmount,
    beforeHoldingProfitAmount,
    afterHoldingProfitAmount
  };
}

function randomShareCode(): string {
  let result = "";
  for (let i = 0; i < SHARE_CODE_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * SHARE_CODE_CHARS.length);
    result += SHARE_CODE_CHARS[index];
  }
  return result;
}

export class SqliteWatchlistStore implements WatchlistStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string, options?: SqliteWatchlistStoreOptions) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");

    this.ensureMetaTable();
    this.ensureLegacyTable();
    this.ensureUserTable();

    const bootstrapUsername = (options?.bootstrapAdminUsername ?? DEFAULT_ADMIN_USERNAME).trim() || DEFAULT_ADMIN_USERNAME;
    const bootstrapPassword = (options?.bootstrapAdminPassword ?? DEFAULT_ADMIN_PASSWORD).trim() || DEFAULT_ADMIN_PASSWORD;
    const bootstrapAdmin = this.ensureBootstrapAdminUser(bootstrapUsername, bootstrapPassword);

    this.ensureUserScopedSchema(bootstrapAdmin.id);
  }

  private ensureMetaTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        meta_key TEXT PRIMARY KEY,
        meta_value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  private getMetaValue(metaKey: string): string | undefined {
    const row = this.db
      .prepare(
        `
          SELECT meta_value AS metaValue
          FROM app_meta
          WHERE meta_key = ?
        `
      )
      .get(metaKey) as { metaValue: string } | undefined;

    return row?.metaValue;
  }

  private setMetaValue(metaKey: string, metaValue: string): void {
    this.db
      .prepare(
        `
          INSERT INTO app_meta (meta_key, meta_value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(meta_key) DO UPDATE SET
            meta_value = excluded.meta_value,
            updated_at = CURRENT_TIMESTAMP
        `
      )
      .run(metaKey, metaValue);
  }

  private tableExists(tableName: string): boolean {
    const row = this.db
      .prepare(
        `
          SELECT 1 AS exists_flag
          FROM sqlite_master
          WHERE type = 'table' AND name = ?
          LIMIT 1
        `
      )
      .get(tableName) as { exists_flag: number } | undefined;

    return Boolean(row?.exists_flag);
  }

  private hasColumn(tableName: string, columnName: string): boolean {
    if (!this.tableExists(tableName)) {
      return false;
    }

    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    return columns.some((column) => column.name === columnName);
  }

  private renameTableIfNeeded(from: string, to: string): void {
    if (!this.tableExists(from) || this.tableExists(to)) {
      return;
    }
    this.db.exec(`ALTER TABLE ${from} RENAME TO ${to};`);
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

    if (!this.hasColumn("user_watchlist_fund", "holding_amount")) {
      this.db.exec("ALTER TABLE user_watchlist_fund ADD COLUMN holding_amount REAL NOT NULL DEFAULT 0;");
    }
    if (!this.hasColumn("user_watchlist_fund", "total_change_pct")) {
      this.db.exec("ALTER TABLE user_watchlist_fund ADD COLUMN total_change_pct REAL NOT NULL DEFAULT 0;");
    }
    if (!this.hasColumn("user_watchlist_fund", "last_accumulated_nav_date")) {
      this.db.exec("ALTER TABLE user_watchlist_fund ADD COLUMN last_accumulated_nav_date TEXT;");
    }
    if (!this.hasColumn("user_watchlist_fund", "created_at")) {
      this.db.exec("ALTER TABLE user_watchlist_fund ADD COLUMN created_at TEXT;");
    }
    if (!this.hasColumn("user_watchlist_fund", "updated_at")) {
      this.db.exec("ALTER TABLE user_watchlist_fund ADD COLUMN updated_at TEXT;");
    }

    this.db.exec(`
      UPDATE user_watchlist_fund
      SET
        holding_amount = COALESCE(holding_amount, 0),
        total_change_pct = COALESCE(total_change_pct, 0),
        created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
        updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP);
    `);
  }

  private ensureUserTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_user (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
        status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ux_app_user_username_ci ON app_user(username COLLATE NOCASE);
    `);
  }

  private toAppUser(row: AppUserRow): AppUserWithPasswordItem {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.passwordHash,
      role: toUserRole(row.role),
      status: toUserStatus(row.status),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private ensureBootstrapAdminUser(username: string, password: string): AppUserWithPasswordItem {
    const existing = this.getUserByUsernameSync(username);
    if (existing) {
      return existing;
    }

    const id = randomUUID();
    const passwordHash = hashPassword(password);
    this.db
      .prepare(
        `
          INSERT INTO app_user (id, username, password_hash, role, status, created_at, updated_at)
          VALUES (?, ?, ?, 'admin', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `
      )
      .run(id, username, passwordHash);

    const created = this.getUserByIdSync(id);
    if (!created) {
      throw new Error("failed to create bootstrap admin user");
    }

    return created;
  }

  private ensureUserScopedSchema(defaultUserId: string): void {
    const schemaVersion = this.getMetaValue("schema_version");
    const hasUserScopedPortfolio = this.tableExists("user_portfolio") && this.hasColumn("user_portfolio", "user_id");
    const hasShareCode = this.hasColumn("user_portfolio", "share_code");
    const hasPositionOperationStatus = this.hasColumn("user_portfolio_fund_operation", "status");

    if (schemaVersion === "4" && hasUserScopedPortfolio && hasShareCode && hasPositionOperationStatus) {
      this.ensureUserScopedTables();
      this.ensurePositionOperationSchema();
      this.ensurePortfolioShareSchema();
      this.ensurePortfolioShareCodeBackfill();
      this.normalizePortfolioDisplayOrder();
      this.normalizePortfolioFundDisplayOrder();
      return;
    }

    this.db.exec("BEGIN TRANSACTION;");
    try {
      if (this.tableExists("user_portfolio") && !this.hasColumn("user_portfolio", "user_id")) {
        this.renameTableIfNeeded("user_portfolio", "user_portfolio_legacy");
      }
      if (this.tableExists("user_fund_state") && !this.hasColumn("user_fund_state", "user_id")) {
        this.renameTableIfNeeded("user_fund_state", "user_fund_state_legacy");
      }
      if (this.tableExists("user_portfolio_fund") && !this.hasColumn("user_portfolio_fund", "user_id")) {
        this.renameTableIfNeeded("user_portfolio_fund", "user_portfolio_fund_legacy");
      }

      this.ensureUserScopedTables();
      this.ensurePositionOperationSchema();
      this.ensurePortfolioShareSchema();
      this.migrateLegacyPortfolioTables(defaultUserId);
      this.migrateLegacyWatchlistIfNeeded(defaultUserId);
      this.ensurePortfolioShareCodeBackfill();
      this.normalizePortfolioDisplayOrder();
      this.normalizePortfolioFundDisplayOrder();
      this.setMetaValue("schema_version", "4");

      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  private ensureUserScopedTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_portfolio (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('FREE', 'RATIO')),
        share_code TEXT,
        total_asset REAL NOT NULL DEFAULT 0,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, id),
        FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ux_user_portfolio_name_ci ON user_portfolio(user_id, name COLLATE NOCASE);

      CREATE TABLE IF NOT EXISTS user_portfolio_layout_preference (
        user_id TEXT PRIMARY KEY,
        funds_tab_index INTEGER NOT NULL DEFAULT 0 CHECK(funds_tab_index >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_decision_ai_config (
        user_id TEXT PRIMARY KEY,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        model TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'chat_completions' CHECK(mode IN ('responses', 'chat_completions')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_fund_state (
        user_id TEXT NOT NULL,
        fund_code TEXT NOT NULL,
        total_change_pct REAL NOT NULL DEFAULT 0,
        last_accumulated_nav_date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, fund_code),
        FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_portfolio_fund (
        user_id TEXT NOT NULL,
        portfolio_id TEXT NOT NULL,
        fund_code TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        holding_amount REAL NOT NULL DEFAULT 0,
        holding_profit_amount REAL NOT NULL DEFAULT 0,
        planned_ratio REAL,
        last_holding_roll_nav_date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, portfolio_id, fund_code),
        FOREIGN KEY (user_id, portfolio_id) REFERENCES user_portfolio(user_id, id) ON DELETE CASCADE,
        FOREIGN KEY (user_id, fund_code) REFERENCES user_fund_state(user_id, fund_code) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_portfolio_fund_operation (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        portfolio_id TEXT NOT NULL,
        fund_code TEXT NOT NULL,
        operation_type TEXT NOT NULL CHECK(operation_type IN ('INCREASE', 'DECREASE')),
        amount REAL NOT NULL,
        before_holding_amount REAL NOT NULL,
        after_holding_amount REAL NOT NULL,
        before_holding_profit_amount REAL NOT NULL,
        after_holding_profit_amount REAL NOT NULL,
        bind_decision_id TEXT,
        bind_action_order INTEGER,
        bind_action_type TEXT CHECK(bind_action_type IN ('BUY', 'SELL', 'HOLD', 'REBALANCE')),
        bind_action_fund_code TEXT,
        bind_action_fund_name TEXT,
        bind_action_risk_level TEXT CHECK(bind_action_risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
        bind_action_rationale TEXT,
        status TEXT NOT NULL DEFAULT 'APPLIED' CHECK(status IN ('PENDING', 'APPLIED')),
        effective_at TEXT,
        applied_at TEXT,
        deleted_at TEXT,
        manual_canceled_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id, portfolio_id) REFERENCES user_portfolio(user_id, id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_portfolio_fund_user_portfolio ON user_portfolio_fund(user_id, portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_user_portfolio_fund_user_fund ON user_portfolio_fund(user_id, fund_code);
      CREATE INDEX IF NOT EXISTS idx_user_portfolio_fund_op_user_portfolio_created
        ON user_portfolio_fund_operation(user_id, portfolio_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_user_portfolio_fund_op_user_portfolio_fund_created
        ON user_portfolio_fund_operation(user_id, portfolio_id, fund_code, created_at DESC);
    `);

    if (this.hasColumn("user_portfolio_fund", "holding_profit_amount")) {
      this.db.exec(`
        UPDATE user_portfolio_fund
        SET holding_profit_amount = COALESCE(holding_profit_amount, 0);
      `);
    }

    if (!this.hasColumn("user_decision_ai_config", "mode")) {
      this.db.exec(
        "ALTER TABLE user_decision_ai_config ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat_completions';",
      );
    }

    this.db.exec(`
      UPDATE user_decision_ai_config
      SET mode = CASE
        WHEN mode IN ('responses', 'chat_completions') THEN mode
        ELSE 'chat_completions'
      END;
    `);

    if (!this.hasColumn("user_portfolio", "total_asset")) {
      this.db.exec("ALTER TABLE user_portfolio ADD COLUMN total_asset REAL NOT NULL DEFAULT 0;");
    }

    this.db.exec(`
      UPDATE user_portfolio
      SET total_asset = COALESCE(total_asset, 0)
      WHERE total_asset IS NULL;
    `);
  }

  private ensurePositionOperationSchema(): void {
    if (!this.hasColumn("user_portfolio_fund_operation", "status")) {
      this.db.exec("ALTER TABLE user_portfolio_fund_operation ADD COLUMN status TEXT NOT NULL DEFAULT 'APPLIED';");
    }
    if (!this.hasColumn("user_portfolio_fund_operation", "effective_at")) {
      this.db.exec("ALTER TABLE user_portfolio_fund_operation ADD COLUMN effective_at TEXT;");
    }
    if (!this.hasColumn("user_portfolio_fund_operation", "applied_at")) {
      this.db.exec("ALTER TABLE user_portfolio_fund_operation ADD COLUMN applied_at TEXT;");
    }
    if (!this.hasColumn("user_portfolio_fund_operation", "deleted_at")) {
      this.db.exec("ALTER TABLE user_portfolio_fund_operation ADD COLUMN deleted_at TEXT;");
    }
    if (!this.hasColumn("user_portfolio_fund_operation", "manual_canceled_at")) {
      this.db.exec("ALTER TABLE user_portfolio_fund_operation ADD COLUMN manual_canceled_at TEXT;");
    }

    this.db.exec(`
      UPDATE user_portfolio_fund_operation
      SET
        status = CASE
          WHEN status = 'PENDING' THEN 'PENDING'
          ELSE 'APPLIED'
        END,
        effective_at = COALESCE(effective_at, created_at),
        applied_at = CASE
          WHEN (CASE WHEN status = 'PENDING' THEN 'PENDING' ELSE 'APPLIED' END) = 'APPLIED'
            THEN COALESCE(applied_at, effective_at, created_at)
          ELSE applied_at
        END
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_portfolio_fund_op_user_status_effective
        ON user_portfolio_fund_operation(user_id, status, effective_at);
    `);
  }

  private ensurePortfolioShareSchema(): void {
    if (!this.hasColumn("user_portfolio", "share_code")) {
      this.db.exec("ALTER TABLE user_portfolio ADD COLUMN share_code TEXT;");
    }

    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_user_portfolio_share_code ON user_portfolio(share_code);

      CREATE TABLE IF NOT EXISTS user_portfolio_share (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        portfolio_id TEXT NOT NULL,
        share_code TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'INACTIVE')),
        snapshot_json TEXT NOT NULL,
        password_hash TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id, portfolio_id) REFERENCES user_portfolio(user_id, id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_portfolio_share_code_status
        ON user_portfolio_share(share_code, status);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_user_portfolio_share_active
        ON user_portfolio_share(user_id, portfolio_id)
        WHERE status = 'ACTIVE';
    `);
  }

  private nextUniqueShareCodeSync(): string {
    const exists = this.db.prepare(
      `
        SELECT 1 AS ok
        FROM user_portfolio
        WHERE share_code = ?
        LIMIT 1
      `,
    );

    for (let i = 0; i < 20; i += 1) {
      const candidate = randomShareCode();
      const hit = exists.get(candidate) as { ok: number } | undefined;
      if (!hit) {
        return candidate;
      }
    }
    throw new Error("failed to generate unique share code");
  }

  private ensurePortfolioShareCodeBackfill(): void {
    const rows = this.db
      .prepare(
        `
          SELECT user_id AS userId, id
          FROM user_portfolio
          WHERE share_code IS NULL OR TRIM(share_code) = ''
          ORDER BY created_at ASC
        `,
      )
      .all() as Array<{ userId: string; id: string }>;

    if (rows.length === 0) {
      return;
    }

    const update = this.db.prepare(
      `
        UPDATE user_portfolio
        SET share_code = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND id = ?
      `,
    );

    for (const row of rows) {
      update.run(this.nextUniqueShareCodeSync(), row.userId, row.id);
    }
  }

  private migrateLegacyPortfolioTables(defaultUserId: string): void {
    if (this.tableExists("user_portfolio_legacy")) {
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
            FROM user_portfolio_legacy
            ORDER BY display_order ASC, updated_at DESC
          `
        )
        .all() as Array<{
        id: string;
        name: string;
        type: string;
        displayOrder: number | null;
        createdAt: string | null;
        updatedAt: string | null;
      }>;

      const insert = this.db.prepare(
        `
          INSERT INTO user_portfolio (
            user_id,
            id,
            name,
            type,
            share_code,
            total_asset,
            display_order,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            share_code = excluded.share_code,
            total_asset = excluded.total_asset,
            display_order = excluded.display_order,
            updated_at = excluded.updated_at
        `
      );

      for (const row of rows) {
        insert.run(
          defaultUserId,
          row.id,
          row.name,
          row.type === "RATIO" ? "RATIO" : "FREE",
          this.nextUniqueShareCodeSync(),
          0,
          row.displayOrder ?? 0,
          toIsoLike(row.createdAt),
          toIsoLike(row.updatedAt)
        );
      }
    }

    if (this.tableExists("user_fund_state_legacy")) {
      const rows = this.db
        .prepare(
          `
            SELECT
              fund_code AS fundCode,
              total_change_pct AS totalChangePct,
              last_accumulated_nav_date AS lastAccumulatedNavDate,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM user_fund_state_legacy
          `
        )
        .all() as Array<{
        fundCode: string;
        totalChangePct: number | null;
        lastAccumulatedNavDate: string | null;
        createdAt: string | null;
        updatedAt: string | null;
      }>;

      const insert = this.db.prepare(
        `
          INSERT INTO user_fund_state (
            user_id,
            fund_code,
            total_change_pct,
            last_accumulated_nav_date,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, fund_code) DO UPDATE SET
            total_change_pct = excluded.total_change_pct,
            last_accumulated_nav_date = excluded.last_accumulated_nav_date,
            updated_at = excluded.updated_at
        `
      );

      for (const row of rows) {
        insert.run(
          defaultUserId,
          row.fundCode,
          Number((row.totalChangePct ?? 0).toFixed(6)),
          row.lastAccumulatedNavDate,
          toIsoLike(row.createdAt),
          toIsoLike(row.updatedAt)
        );
      }
    }

    if (this.tableExists("user_portfolio_fund_legacy")) {
      const rows = this.db
        .prepare(
          `
            SELECT
              portfolio_id AS portfolioId,
              fund_code AS fundCode,
              display_order AS displayOrder,
              holding_amount AS holdingAmount,
              holding_profit_amount AS holdingProfitAmount,
              planned_ratio AS plannedRatio,
              last_holding_roll_nav_date AS lastHoldingRollNavDate,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM user_portfolio_fund_legacy
          `
        )
        .all() as Array<{
        portfolioId: string;
        fundCode: string;
        displayOrder: number | null;
        holdingAmount: number | null;
        holdingProfitAmount: number | null;
        plannedRatio: number | null;
        lastHoldingRollNavDate: string | null;
        createdAt: string | null;
        updatedAt: string | null;
      }>;

      const ensureFundState = this.db.prepare(
        `
          INSERT INTO user_fund_state (user_id, fund_code, total_change_pct, created_at, updated_at)
          VALUES (?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, fund_code) DO NOTHING
        `
      );

      const insert = this.db.prepare(
        `
          INSERT INTO user_portfolio_fund (
            user_id,
            portfolio_id,
            fund_code,
            display_order,
            holding_amount,
            holding_profit_amount,
            planned_ratio,
            last_holding_roll_nav_date,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, portfolio_id, fund_code) DO UPDATE SET
            display_order = excluded.display_order,
            holding_amount = excluded.holding_amount,
            holding_profit_amount = excluded.holding_profit_amount,
            planned_ratio = excluded.planned_ratio,
            last_holding_roll_nav_date = excluded.last_holding_roll_nav_date,
            updated_at = excluded.updated_at
        `
      );

      for (const row of rows) {
        ensureFundState.run(defaultUserId, row.fundCode);
        insert.run(
          defaultUserId,
          row.portfolioId,
          row.fundCode,
          row.displayOrder ?? 0,
          Number((row.holdingAmount ?? 0).toFixed(2)),
          Number((row.holdingProfitAmount ?? 0).toFixed(2)),
          row.plannedRatio,
          row.lastHoldingRollNavDate,
          toIsoLike(row.createdAt),
          toIsoLike(row.updatedAt)
        );
      }
    }

    this.db.exec(`
      INSERT INTO user_fund_state (
        user_id,
        fund_code,
        total_change_pct,
        created_at,
        updated_at
      )
      SELECT
        pf.user_id,
        pf.fund_code,
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM user_portfolio_fund pf
      LEFT JOIN user_fund_state fs
        ON fs.user_id = pf.user_id AND fs.fund_code = pf.fund_code
      WHERE fs.fund_code IS NULL;
    `);
  }

  private migrateLegacyWatchlistIfNeeded(defaultUserId: string): void {
    const portfolioCountRow = this.db
      .prepare(
        `
          SELECT COUNT(1) AS count
          FROM user_portfolio
          WHERE user_id = ?
        `
      )
      .get(defaultUserId) as { count: number } | undefined;

    if ((portfolioCountRow?.count ?? 0) > 0) {
      return;
    }

    const legacyCountRow = this.db.prepare("SELECT COUNT(1) AS count FROM user_watchlist_fund").get() as { count: number } | undefined;
    if ((legacyCountRow?.count ?? 0) === 0) {
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
      .all() as unknown as LegacyWatchlistFundRow[];

    if (legacyRows.length === 0) {
      return;
    }

    const portfolioId = randomUUID();

    this.db
      .prepare(
        `
          INSERT INTO user_portfolio (user_id, id, name, type, share_code, display_order, created_at, updated_at)
          VALUES (?, ?, ?, 'FREE', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `
      )
      .run(defaultUserId, portfolioId, DEFAULT_PORTFOLIO_NAME, this.nextUniqueShareCodeSync());

    const insertFundState = this.db.prepare(
      `
        INSERT INTO user_fund_state (user_id, fund_code, total_change_pct, last_accumulated_nav_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, fund_code) DO UPDATE SET
          total_change_pct = excluded.total_change_pct,
          last_accumulated_nav_date = excluded.last_accumulated_nav_date,
          updated_at = excluded.updated_at
      `
    );

    const insertPortfolioFund = this.db.prepare(
      `
        INSERT INTO user_portfolio_fund (
          user_id,
          portfolio_id,
          fund_code,
          display_order,
          holding_amount,
          planned_ratio,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
        ON CONFLICT(user_id, portfolio_id, fund_code) DO UPDATE SET
          holding_amount = excluded.holding_amount,
          planned_ratio = NULL,
          updated_at = excluded.updated_at
      `
    );

    for (const [index, row] of legacyRows.entries()) {
      const createdAt = row.createdAt ?? new Date().toISOString();
      const updatedAt = row.updatedAt ?? createdAt;
      insertFundState.run(
        defaultUserId,
        row.fundCode,
        Number((row.totalChangePct ?? 0).toFixed(6)),
        row.lastAccumulatedNavDate,
        createdAt,
        updatedAt
      );
      insertPortfolioFund.run(
        defaultUserId,
        portfolioId,
        row.fundCode,
        index,
        Number((row.holdingAmount ?? 0).toFixed(2)),
        createdAt,
        updatedAt
      );
    }
  }

  private normalizePortfolioFundDisplayOrder(): void {
    const hasDuplicateOrder = this.db
      .prepare(
        `
          SELECT 1
          FROM user_portfolio_fund
          GROUP BY user_id, portfolio_id, display_order
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
            PARTITION BY user_id, portfolio_id
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
          GROUP BY user_id, display_order
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
            PARTITION BY user_id
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

  private toPortfolio(row: PortfolioRow): PortfolioItem {
    return {
      id: row.id,
      name: row.name,
      type: toPortfolioType(row.type),
      shareCode: row.shareCode ?? "",
      totalAsset: roundCurrency(row.totalAsset ?? 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private toPortfolioFund(row: PortfolioFundRow): PortfolioFundItem {
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

  private toPortfolioShare(row: PortfolioShareRow): PortfolioShareRecord {
    return {
      id: row.id,
      userId: row.userId,
      portfolioId: row.portfolioId,
      shareCode: row.shareCode,
      status: row.status,
      snapshotJson: row.snapshotJson,
      ...(row.passwordHash ? { passwordHash: row.passwordHash } : {}),
      ...(row.expiresAt ? { expiresAt: row.expiresAt } : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toPositionOperation(row: PositionOperationRow): PositionOperationItem {
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      fundCode: row.fundCode,
      operationType: row.operationType,
      amount: Number(row.amount.toFixed(2)),
      beforeHoldingAmount: Number(row.beforeHoldingAmount.toFixed(2)),
      afterHoldingAmount: Number(row.afterHoldingAmount.toFixed(2)),
      beforeHoldingProfitAmount: Number(row.beforeHoldingProfitAmount.toFixed(2)),
      afterHoldingProfitAmount: Number(row.afterHoldingProfitAmount.toFixed(2)),
      status: row.status,
      effectiveAt: row.effectiveAt ?? row.createdAt,
      ...(row.appliedAt ? { appliedAt: row.appliedAt } : {}),
      ...(row.manualCanceledAt ? { manualCanceledAt: row.manualCanceledAt } : {}),
      createdAt: row.createdAt
    };
  }

  private getPortfolioFundStateSync(
    userId: string,
    portfolioId: string,
    fundCode: string
  ): { holdingAmount: number; holdingProfitAmount: number } | undefined {
    const row = this.db
      .prepare(
        `
          SELECT
            holding_amount AS holdingAmount,
            holding_profit_amount AS holdingProfitAmount
          FROM user_portfolio_fund
          WHERE user_id = ? AND portfolio_id = ? AND fund_code = ?
        `
      )
      .get(userId, portfolioId, fundCode) as
      | {
          holdingAmount: number | null;
          holdingProfitAmount: number | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      holdingAmount: roundCurrency(row.holdingAmount ?? 0),
      holdingProfitAmount: roundCurrency(row.holdingProfitAmount ?? 0)
    };
  }

  private listPendingOperationRowsForFund(
    userId: string,
    portfolioId: string,
    fundCode: string
  ): PositionOperationRow[] {
    return this.db
      .prepare(
        `
          SELECT
            id,
            user_id AS userId,
            portfolio_id AS portfolioId,
            fund_code AS fundCode,
            operation_type AS operationType,
            amount,
            before_holding_amount AS beforeHoldingAmount,
            after_holding_amount AS afterHoldingAmount,
            before_holding_profit_amount AS beforeHoldingProfitAmount,
            after_holding_profit_amount AS afterHoldingProfitAmount,
            bind_decision_id AS bindDecisionId,
            bind_action_order AS bindActionOrder,
            bind_action_type AS bindActionType,
            bind_action_fund_code AS bindActionFundCode,
            bind_action_fund_name AS bindActionFundName,
            bind_action_risk_level AS bindActionRiskLevel,
            bind_action_rationale AS bindActionRationale,
            status,
            effective_at AS effectiveAt,
            applied_at AS appliedAt,
            deleted_at AS deletedAt,
            manual_canceled_at AS manualCanceledAt,
            created_at AS createdAt
          FROM user_portfolio_fund_operation
          WHERE
            user_id = ?
            AND portfolio_id = ?
            AND fund_code = ?
            AND status = 'PENDING'
            AND deleted_at IS NULL
          ORDER BY effective_at ASC, created_at ASC, id ASC
        `
      )
      .all(userId, portfolioId, fundCode) as unknown as PositionOperationRow[];
  }

  private getPositionOperationRow(
    userId: string,
    portfolioId: string,
    fundCode: string,
    operationId: string
  ): PositionOperationRow | undefined {
    return this.db
      .prepare(
        `
          SELECT
            id,
            user_id AS userId,
            portfolio_id AS portfolioId,
            fund_code AS fundCode,
            operation_type AS operationType,
            amount,
            before_holding_amount AS beforeHoldingAmount,
            after_holding_amount AS afterHoldingAmount,
            before_holding_profit_amount AS beforeHoldingProfitAmount,
            after_holding_profit_amount AS afterHoldingProfitAmount,
            bind_decision_id AS bindDecisionId,
            bind_action_order AS bindActionOrder,
            bind_action_type AS bindActionType,
            bind_action_fund_code AS bindActionFundCode,
            bind_action_fund_name AS bindActionFundName,
            bind_action_risk_level AS bindActionRiskLevel,
            bind_action_rationale AS bindActionRationale,
            status,
            effective_at AS effectiveAt,
            applied_at AS appliedAt,
            deleted_at AS deletedAt,
            manual_canceled_at AS manualCanceledAt,
            created_at AS createdAt
          FROM user_portfolio_fund_operation
          WHERE
            user_id = ?
            AND portfolio_id = ?
            AND fund_code = ?
            AND id = ?
          LIMIT 1
        `
      )
      .get(userId, portfolioId, fundCode, operationId) as PositionOperationRow | undefined;
  }

  private recomputePendingOperationsInTransaction(
    userId: string,
    portfolioId: string,
    fundCode: string,
    baseState: { holdingAmount: number; holdingProfitAmount: number }
  ): { holdingAmount: number; holdingProfitAmount: number } {
    const rows = this.listPendingOperationRowsForFund(userId, portfolioId, fundCode);
    const updateStmt = this.db.prepare(
      `
        UPDATE user_portfolio_fund_operation
        SET
          before_holding_amount = ?,
          after_holding_amount = ?,
          before_holding_profit_amount = ?,
          after_holding_profit_amount = ?
        WHERE id = ?
      `
    );

    let runningState = {
      holdingAmount: roundCurrency(baseState.holdingAmount),
      holdingProfitAmount: roundCurrency(baseState.holdingProfitAmount)
    };

    for (const row of rows) {
      let snapshot;
      try {
        snapshot = computeOperationSnapshot({
          beforeHoldingAmount: runningState.holdingAmount,
          beforeHoldingProfitAmount: runningState.holdingProfitAmount,
          operationType: row.operationType,
          amount: row.amount
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("exceeds current holding amount")) {
          throw new Error("remaining pending operations exceed current holding amount");
        }
        throw error;
      }

      updateStmt.run(
        snapshot.beforeHoldingAmount,
        snapshot.afterHoldingAmount,
        snapshot.beforeHoldingProfitAmount,
        snapshot.afterHoldingProfitAmount,
        row.id
      );

      runningState = {
        holdingAmount: snapshot.afterHoldingAmount,
        holdingProfitAmount: snapshot.afterHoldingProfitAmount
      };
    }

    return runningState;
  }

  private settleDuePositionOperations(
    userId: string,
    options?: { portfolioId?: string; fundCode?: string }
  ): void {
    const now = new Date();
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            user_id AS userId,
            portfolio_id AS portfolioId,
            fund_code AS fundCode,
            operation_type AS operationType,
            amount,
            before_holding_amount AS beforeHoldingAmount,
            after_holding_amount AS afterHoldingAmount,
            before_holding_profit_amount AS beforeHoldingProfitAmount,
            after_holding_profit_amount AS afterHoldingProfitAmount,
            bind_decision_id AS bindDecisionId,
            bind_action_order AS bindActionOrder,
            bind_action_type AS bindActionType,
            bind_action_fund_code AS bindActionFundCode,
            bind_action_fund_name AS bindActionFundName,
            bind_action_risk_level AS bindActionRiskLevel,
            bind_action_rationale AS bindActionRationale,
            status,
            effective_at AS effectiveAt,
            applied_at AS appliedAt,
            deleted_at AS deletedAt,
            manual_canceled_at AS manualCanceledAt,
            created_at AS createdAt
          FROM user_portfolio_fund_operation
          WHERE
            user_id = ?
            AND status = 'PENDING'
            AND deleted_at IS NULL
            AND effective_at IS NOT NULL
            AND (? IS NULL OR portfolio_id = ?)
            AND (? IS NULL OR fund_code = ?)
          ORDER BY effective_at ASC, created_at ASC, id ASC
        `
      )
      .all(
        userId,
        options?.portfolioId ?? null,
        options?.portfolioId ?? null,
        options?.fundCode ?? null,
        options?.fundCode ?? null
      ) as unknown as PositionOperationRow[];

    const dueRows = rows.filter((row) => row.effectiveAt && isSettlementDue(row.effectiveAt, now));
    if (dueRows.length === 0) {
      return;
    }

    const updateFundStmt = this.db.prepare(
      `
        UPDATE user_portfolio_fund
        SET
          holding_amount = ?,
          holding_profit_amount = ?,
          updated_at = ?
        WHERE user_id = ? AND portfolio_id = ? AND fund_code = ?
      `
    );
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const appliedAt = now.toISOString();
      for (const row of dueRows) {
        updateFundStmt.run(
          row.afterHoldingAmount,
          row.afterHoldingProfitAmount,
          appliedAt,
          userId,
          row.portfolioId,
          row.fundCode
        );
        this.db
          .prepare(
            `
              UPDATE user_portfolio_fund_operation
              SET
                status = 'APPLIED',
                applied_at = ?
              WHERE id = ?
            `
          )
          .run(appliedAt, row.id);
      }
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  private getUserByIdSync(userId: string): AppUserWithPasswordItem | undefined {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            username,
            password_hash AS passwordHash,
            role,
            status,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM app_user
          WHERE id = ?
        `
      )
      .get(userId) as unknown as AppUserRow | undefined;

    if (!row) {
      return undefined;
    }

    return this.toAppUser(row);
  }

  private getUserByUsernameSync(username: string): AppUserWithPasswordItem | undefined {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            username,
            password_hash AS passwordHash,
            role,
            status,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM app_user
          WHERE username = ? COLLATE NOCASE
        `
      )
      .get(username) as unknown as AppUserRow | undefined;

    if (!row) {
      return undefined;
    }

    return this.toAppUser(row);
  }

  async listUsers(): Promise<AppUserItem[]> {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            username,
            role,
            status,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM app_user
          ORDER BY created_at ASC
        `
      )
      .all() as Array<Omit<AppUserRow, "passwordHash">>;

    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      role: toUserRole(row.role),
      status: toUserStatus(row.status),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
  }

  async getUserById(userId: string): Promise<AppUserWithPasswordItem | undefined> {
    return this.getUserByIdSync(userId);
  }

  async getUserByUsername(username: string): Promise<AppUserWithPasswordItem | undefined> {
    return this.getUserByUsernameSync(username.trim());
  }

  async createUser(input: CreateUserInput): Promise<AppUserItem> {
    const username = input.username.trim();
    if (!username) {
      throw new Error("username is required");
    }

    const id = randomUUID();
    const passwordHash = hashPassword(input.password);
    this.db
      .prepare(
        `
          INSERT INTO app_user (id, username, password_hash, role, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `
      )
      .run(id, username, passwordHash, input.role, input.status ?? "active");

    const row = await this.getUserById(id);
    if (!row) {
      throw new Error("failed to create user");
    }

    return {
      id: row.id,
      username: row.username,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  async exportData(options: { username?: string; all?: boolean }): Promise<ExportDataPayload> {
    let users: AppUserWithPasswordItem[] = [];

    if (options.username) {
      const user = await this.getUserByUsername(options.username);
      if (!user) {
        throw new Error(`user ${options.username} not found`);
      }
      users = [user];
    } else if (options.all) {
      const rows = this.db
        .prepare(
          `
            SELECT
              id,
              username,
              password_hash AS passwordHash,
              role,
              status,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM app_user
            ORDER BY created_at ASC
          `
        )
        .all() as unknown as AppUserRow[];
      users = rows.map((row) => this.toAppUser(row));
    }

    const userIds = users.map((user) => user.id);
    const placeholders = userIds.map(() => "?").join(", ");

    const portfolios =
      userIds.length === 0
        ? []
        : (this.db
            .prepare(
              `
                SELECT
                  user_id AS userId,
                  id,
                  name,
                  type,
                  share_code AS shareCode,
                  total_asset AS totalAsset,
                  display_order AS displayOrder,
                  created_at AS createdAt,
                  updated_at AS updatedAt
                FROM user_portfolio
                WHERE user_id IN (${placeholders})
                ORDER BY user_id ASC, display_order ASC, updated_at DESC
              `
            )
            .all(...userIds) as ExportDataPayload["portfolios"]);

    const fundStates =
      userIds.length === 0
        ? []
        : (this.db
            .prepare(
              `
                SELECT
                  user_id AS userId,
                  fund_code AS fundCode,
                  total_change_pct AS totalChangePct,
                  last_accumulated_nav_date AS lastAccumulatedNavDate,
                  created_at AS createdAt,
                  updated_at AS updatedAt
                FROM user_fund_state
                WHERE user_id IN (${placeholders})
                ORDER BY user_id ASC, fund_code ASC
              `
            )
            .all(...userIds) as ExportDataPayload["fundStates"]);

    const portfolioFunds =
      userIds.length === 0
        ? []
        : (this.db
            .prepare(
              `
                SELECT
                  user_id AS userId,
                  portfolio_id AS portfolioId,
                  fund_code AS fundCode,
                  display_order AS displayOrder,
                  holding_amount AS holdingAmount,
                  holding_profit_amount AS holdingProfitAmount,
                  planned_ratio AS plannedRatio,
                  last_holding_roll_nav_date AS lastHoldingRollNavDate,
                  created_at AS createdAt,
                  updated_at AS updatedAt
                FROM user_portfolio_fund
                WHERE user_id IN (${placeholders})
                ORDER BY user_id ASC, portfolio_id ASC, display_order ASC, updated_at DESC
              `
            )
            .all(...userIds) as ExportDataPayload["portfolioFunds"]);

    return {
      meta: {
        version: 2,
        exportedAt: new Date().toISOString()
      },
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        passwordHash: user.passwordHash,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      })),
      portfolios,
      fundStates,
      portfolioFunds
    };
  }

  async importData(payload: ExportDataPayload): Promise<void> {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const findUserByUsername = this.db.prepare(
        `
          SELECT id
          FROM app_user
          WHERE username = ? COLLATE NOCASE
        `
      );

      const findUserById = this.db.prepare(
        `
          SELECT id
          FROM app_user
          WHERE id = ?
        `
      );

      const insertUser = this.db.prepare(
        `
          INSERT INTO app_user (id, username, password_hash, role, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      );

      const updateUserById = this.db.prepare(
        `
          UPDATE app_user
          SET
            username = ?,
            password_hash = ?,
            role = ?,
            status = ?,
            updated_at = ?
          WHERE id = ?
        `
      );

      const userIdMap = new Map<string, string>();
      for (const user of payload.users ?? []) {
        const existingByUsername = findUserByUsername.get(user.username) as { id: string } | undefined;
        const updatedAt = toIsoLike(user.updatedAt);
        if (existingByUsername) {
          updateUserById.run(user.username, user.passwordHash, user.role, user.status, updatedAt, existingByUsername.id);
          userIdMap.set(user.id, existingByUsername.id);
          continue;
        }

        const existingById = findUserById.get(user.id) as { id: string } | undefined;
        if (existingById) {
          updateUserById.run(user.username, user.passwordHash, user.role, user.status, updatedAt, user.id);
          userIdMap.set(user.id, user.id);
          continue;
        }

        insertUser.run(
          user.id,
          user.username,
          user.passwordHash,
          user.role,
          user.status,
          toIsoLike(user.createdAt),
          updatedAt
        );
        userIdMap.set(user.id, user.id);
      }

      const upsertPortfolio = this.db.prepare(
        `
          INSERT INTO user_portfolio (user_id, id, name, type, share_code, total_asset, display_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            share_code = excluded.share_code,
            total_asset = excluded.total_asset,
            display_order = excluded.display_order,
            updated_at = excluded.updated_at
        `
      );

      for (const row of payload.portfolios ?? []) {
        const mappedUserId = userIdMap.get(row.userId) ?? row.userId;
        upsertPortfolio.run(
          mappedUserId,
          row.id,
          row.name,
          row.type,
          row.shareCode ?? this.nextUniqueShareCodeSync(),
          row.totalAsset ?? 0,
          row.displayOrder,
          toIsoLike(row.createdAt),
          toIsoLike(row.updatedAt)
        );
      }

      const upsertFundState = this.db.prepare(
        `
          INSERT INTO user_fund_state (
            user_id,
            fund_code,
            total_change_pct,
            last_accumulated_nav_date,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, fund_code) DO UPDATE SET
            total_change_pct = excluded.total_change_pct,
            last_accumulated_nav_date = excluded.last_accumulated_nav_date,
            updated_at = excluded.updated_at
        `
      );

      for (const row of payload.fundStates ?? []) {
        const mappedUserId = userIdMap.get(row.userId) ?? row.userId;
        upsertFundState.run(
          mappedUserId,
          row.fundCode,
          Number((row.totalChangePct ?? 0).toFixed(6)),
          row.lastAccumulatedNavDate ?? null,
          toIsoLike(row.createdAt),
          toIsoLike(row.updatedAt)
        );
      }

      const ensureFundState = this.db.prepare(
        `
          INSERT INTO user_fund_state (user_id, fund_code, total_change_pct, created_at, updated_at)
          VALUES (?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, fund_code) DO NOTHING
        `
      );

      const upsertPortfolioFund = this.db.prepare(
        `
          INSERT INTO user_portfolio_fund (
            user_id,
            portfolio_id,
            fund_code,
            display_order,
            holding_amount,
            holding_profit_amount,
            planned_ratio,
            last_holding_roll_nav_date,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, portfolio_id, fund_code) DO UPDATE SET
            display_order = excluded.display_order,
            holding_amount = excluded.holding_amount,
            holding_profit_amount = excluded.holding_profit_amount,
            planned_ratio = excluded.planned_ratio,
            last_holding_roll_nav_date = excluded.last_holding_roll_nav_date,
            updated_at = excluded.updated_at
        `
      );

      for (const row of payload.portfolioFunds ?? []) {
        const mappedUserId = userIdMap.get(row.userId) ?? row.userId;
        ensureFundState.run(mappedUserId, row.fundCode);
        upsertPortfolioFund.run(
          mappedUserId,
          row.portfolioId,
          row.fundCode,
          row.displayOrder,
          Number((row.holdingAmount ?? 0).toFixed(2)),
          Number((row.holdingProfitAmount ?? 0).toFixed(2)),
          row.plannedRatio ?? null,
          row.lastHoldingRollNavDate ?? null,
          toIsoLike(row.createdAt),
          toIsoLike(row.updatedAt)
        );
      }

      this.normalizePortfolioDisplayOrder();
      this.normalizePortfolioFundDisplayOrder();

      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  async listPortfolios(userId: string): Promise<PortfolioItem[]> {
    const rows = this.db
      .prepare(
        `
          SELECT
            user_id AS userId,
            id,
            name,
            type,
            share_code AS shareCode,
            total_asset AS totalAsset,
            display_order AS displayOrder,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM user_portfolio
          WHERE user_id = ?
          ORDER BY display_order ASC, updated_at DESC
        `
      )
      .all(userId) as unknown as PortfolioRow[];

    return rows.map((row) => this.toPortfolio(row));
  }

  async getPortfolio(userId: string, portfolioId: string): Promise<PortfolioItem | undefined> {
    const row = this.db
      .prepare(
        `
          SELECT
            user_id AS userId,
            id,
            name,
            type,
            share_code AS shareCode,
            total_asset AS totalAsset,
            display_order AS displayOrder,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM user_portfolio
          WHERE user_id = ? AND id = ?
        `
      )
      .get(userId, portfolioId) as unknown as PortfolioRow | undefined;

    if (!row) {
      return undefined;
    }

    return this.toPortfolio(row);
  }

  private getPortfolioHoldingAmountTotal(userId: string, portfolioId: string): number {
    const row = this.db
      .prepare(
        `
          SELECT COALESCE(SUM(holding_amount), 0) AS totalHoldingAmount
          FROM user_portfolio_fund
          WHERE user_id = ? AND portfolio_id = ?
        `
      )
      .get(userId, portfolioId) as { totalHoldingAmount: number | null } | undefined;

    return roundCurrency(row?.totalHoldingAmount ?? 0);
  }

  async createPortfolio(userId: string, name: string, type: PortfolioType, totalAsset = 0): Promise<PortfolioItem> {
    const id = randomUUID();
    const shareCode = this.nextUniqueShareCodeSync();
    const row = this.db
      .prepare(
        `
          SELECT COALESCE(MAX(display_order), -1) AS maxDisplayOrder
          FROM user_portfolio
          WHERE user_id = ?
        `
      )
      .get(userId) as { maxDisplayOrder: number | null } | undefined;

    const nextDisplayOrder = (row?.maxDisplayOrder ?? -1) + 1;
    this.db
      .prepare(
        `
          INSERT INTO user_portfolio (user_id, id, name, type, share_code, total_asset, display_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `
      )
      .run(userId, id, name, type, shareCode, roundCurrency(totalAsset), nextDisplayOrder);

    const created = await this.getPortfolio(userId, id);
    if (!created) {
      throw new Error("failed to create portfolio");
    }

    return created;
  }

  async updatePortfolio(
    userId: string,
    portfolioId: string,
    input: { name?: string; totalAsset?: number }
  ): Promise<boolean> {
    const assignments: string[] = [];
    const values: Array<string | number> = [];

    if (typeof input.name === "string") {
      assignments.push("name = ?");
      values.push(input.name);
    }
    if (typeof input.totalAsset === "number") {
      assignments.push("total_asset = ?");
      values.push(roundCurrency(input.totalAsset));
    }
    if (assignments.length === 0) {
      return false;
    }

    const result = this.db
      .prepare(
        `
          UPDATE user_portfolio
          SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND id = ?
        `
      )
      .run(...values, userId, portfolioId) as SqliteRunResult;

    return toChanges(result) > 0;
  }

  async deletePortfolio(userId: string, portfolioId: string): Promise<boolean> {
    const result = this.db
      .prepare(
        `
          DELETE FROM user_portfolio
          WHERE user_id = ? AND id = ?
        `
      )
      .run(userId, portfolioId) as SqliteRunResult;

    const removed = toChanges(result) > 0;
    if (removed) {
      await this.cleanupOrphanFundStates(userId);
    }

    return removed;
  }

  async validatePortfolioSet(userId: string, orderedPortfolioIds: string[]): Promise<boolean> {
    const rows = this.db
      .prepare(
        `
          SELECT id
          FROM user_portfolio
          WHERE user_id = ?
        `
      )
      .all(userId) as Array<{ id: string }>;

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

  async reorderPortfolios(userId: string, orderedPortfolioIds: string[]): Promise<void> {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const updateStmt = this.db.prepare(
        `
          UPDATE user_portfolio
          SET display_order = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND id = ?
        `
      );

      for (const [index, portfolioId] of orderedPortfolioIds.entries()) {
        const result = updateStmt.run(index, userId, portfolioId) as SqliteRunResult;
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

  async getPortfolioTabLayoutPreference(userId: string): Promise<PortfolioTabLayoutPreference> {
    const row = this.db
      .prepare(
        `
          SELECT
            user_id AS userId,
            funds_tab_index AS fundsTabIndex
          FROM user_portfolio_layout_preference
          WHERE user_id = ?
        `
      )
      .get(userId) as PortfolioTabLayoutPreferenceRow | undefined;

    return {
      fundsTabIndex: Math.max(0, Math.floor(row?.fundsTabIndex ?? 0))
    };
  }

  async setPortfolioTabLayoutPreference(userId: string, preference: PortfolioTabLayoutPreference): Promise<void> {
    const fundsTabIndex = Math.max(0, Math.floor(preference.fundsTabIndex));
    this.db
      .prepare(
        `
          INSERT INTO user_portfolio_layout_preference (user_id, funds_tab_index, created_at, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET
            funds_tab_index = excluded.funds_tab_index,
            updated_at = CURRENT_TIMESTAMP
        `
      )
      .run(userId, fundsTabIndex);
  }

  async getDecisionAiConfig(userId: string): Promise<UserDecisionAiConfigItem | undefined> {
    const row = this.db
      .prepare(
        `
          SELECT
            user_id AS userId,
            base_url AS baseUrl,
            api_key AS apiKey,
            model,
            mode,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM user_decision_ai_config
          WHERE user_id = ?
        `
      )
      .get(userId) as UserDecisionAiConfigRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      userId: row.userId,
      baseUrl: row.baseUrl,
      apiKey: row.apiKey,
      model: row.model,
      mode: row.mode,
      hasApiKey: row.apiKey.trim().length > 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async upsertDecisionAiConfig(
    userId: string,
    input: { baseUrl: string; model: string; mode: DecisionAiMode; apiKey: string }
  ): Promise<UserDecisionAiConfigItem> {
    this.db
      .prepare(
        `
          INSERT INTO user_decision_ai_config (user_id, base_url, api_key, model, mode, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET
            base_url = excluded.base_url,
            api_key = excluded.api_key,
            model = excluded.model,
            mode = excluded.mode,
            updated_at = CURRENT_TIMESTAMP
        `
      )
      .run(userId, input.baseUrl, input.apiKey, input.model, input.mode);

    const config = await this.getDecisionAiConfig(userId);
    if (!config) {
      throw new Error("failed to persist decision ai config");
    }
    return config;
  }

  async listPortfolioFunds(userId: string, portfolioId: string): Promise<PortfolioFundItem[]> {
    this.settleDuePositionOperations(userId, { portfolioId });
    const rows = this.db
      .prepare(
        `
          SELECT
            pf.user_id AS userId,
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
          JOIN user_portfolio p
            ON p.user_id = pf.user_id
           AND p.id = pf.portfolio_id
          WHERE pf.user_id = ? AND pf.portfolio_id = ?
          ORDER BY pf.display_order ASC, pf.updated_at DESC
        `
      )
      .all(userId, portfolioId) as unknown as PortfolioFundRow[];

    return rows.map((row) => this.toPortfolioFund(row));
  }

  async listAllPortfolioFunds(userId: string): Promise<PortfolioFundItem[]> {
    this.settleDuePositionOperations(userId);
    const rows = this.db
      .prepare(
        `
          SELECT
            pf.user_id AS userId,
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
          JOIN user_portfolio p
            ON p.user_id = pf.user_id
           AND p.id = pf.portfolio_id
          WHERE pf.user_id = ?
          ORDER BY pf.created_at DESC, pf.rowid DESC
        `
      )
      .all(userId) as unknown as PortfolioFundRow[];

    return rows.map((row) => this.toPortfolioFund(row));
  }

  async getPortfolioFund(userId: string, portfolioId: string, fundCode: string): Promise<PortfolioFundItem | undefined> {
    this.settleDuePositionOperations(userId, { portfolioId, fundCode });
    const row = this.db
      .prepare(
        `
          SELECT
            pf.user_id AS userId,
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
          JOIN user_portfolio p
            ON p.user_id = pf.user_id
           AND p.id = pf.portfolio_id
          WHERE pf.user_id = ? AND pf.portfolio_id = ? AND pf.fund_code = ?
        `
      )
      .get(userId, portfolioId, fundCode) as unknown as PortfolioFundRow | undefined;

    if (!row) {
      return undefined;
    }

    return this.toPortfolioFund(row);
  }

  private async getNextDisplayOrder(userId: string, portfolioId: string): Promise<number> {
    const row = this.db
      .prepare(
        `
          SELECT COALESCE(MAX(display_order), -1) AS maxDisplayOrder
          FROM user_portfolio_fund
          WHERE user_id = ? AND portfolio_id = ?
        `
      )
      .get(userId, portfolioId) as { maxDisplayOrder: number | null } | undefined;

    return (row?.maxDisplayOrder ?? -1) + 1;
  }

  async upsertPortfolioFund(userId: string, input: UpsertPortfolioFundInput): Promise<void> {
    await this.ensureFundState(userId, input.fundCode);
    const nextDisplayOrder = await this.getNextDisplayOrder(userId, input.portfolioId);
    const holdingProfitAmount = typeof input.holdingProfitAmount === "number" ? input.holdingProfitAmount : null;

    this.db
      .prepare(
        `
          INSERT INTO user_portfolio_fund (
            user_id,
            portfolio_id,
            fund_code,
            display_order,
            holding_amount,
            holding_profit_amount,
            planned_ratio,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, COALESCE(?, 0), ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, portfolio_id, fund_code) DO UPDATE SET
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
        userId,
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

  async updatePortfolioFund(userId: string, input: UpdatePortfolioFundInput): Promise<boolean> {
    this.settleDuePositionOperations(userId, { portfolioId: input.portfolioId, fundCode: input.fundCode });
    const current = this.getPortfolioFundStateSync(userId, input.portfolioId, input.fundCode);
    if (!current) {
      return false;
    }

    const nextHoldingAmount = typeof input.holdingAmount === "number" ? input.holdingAmount : current.holdingAmount;
    const nextHoldingProfitAmount =
      typeof input.holdingProfitAmount === "number" ? input.holdingProfitAmount : current.holdingProfitAmount;
    const nextPlannedRatio = input.plannedRatio;

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db
        .prepare(
          `
            UPDATE user_portfolio_fund
            SET
              holding_amount = ?,
              holding_profit_amount = ?,
              planned_ratio = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND portfolio_id = ? AND fund_code = ?
          `
        )
        .run(nextHoldingAmount, nextHoldingProfitAmount, nextPlannedRatio ?? null, userId, input.portfolioId, input.fundCode);

      this.recomputePendingOperationsInTransaction(userId, input.portfolioId, input.fundCode, {
        holdingAmount: nextHoldingAmount,
        holdingProfitAmount: nextHoldingProfitAmount
      });

      this.db.exec("COMMIT;");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  async applyPositionOperation(userId: string, input: PositionOperationInput): Promise<PositionOperationItem | undefined> {
    this.settleDuePositionOperations(userId, { portfolioId: input.portfolioId, fundCode: input.fundCode });
    const current = this.getPortfolioFundStateSync(userId, input.portfolioId, input.fundCode);
    if (!current) {
      return undefined;
    }

    const amount = roundCurrency(input.amount);

    const operationId = randomUUID();
    const now = new Date().toISOString();
    const effectiveAt = getNextWorkingDaySettlementTime(new Date()).toISOString();
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const projectedState = this.recomputePendingOperationsInTransaction(userId, input.portfolioId, input.fundCode, {
        holdingAmount: current.holdingAmount,
        holdingProfitAmount: current.holdingProfitAmount
      });
      const snapshot = computeOperationSnapshot({
        beforeHoldingAmount: projectedState.holdingAmount,
        beforeHoldingProfitAmount: projectedState.holdingProfitAmount,
        operationType: input.operationType,
        amount
      });

      this.db
        .prepare(
          `
            INSERT INTO user_portfolio_fund_operation (
              id,
              user_id,
              portfolio_id,
              fund_code,
              operation_type,
              amount,
              before_holding_amount,
              after_holding_amount,
              before_holding_profit_amount,
              after_holding_profit_amount,
              bind_decision_id,
              bind_action_order,
              bind_action_type,
              bind_action_fund_code,
              bind_action_fund_name,
              bind_action_risk_level,
              bind_action_rationale,
              status,
              effective_at,
              applied_at,
              deleted_at,
              manual_canceled_at,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          operationId,
          userId,
          input.portfolioId,
          input.fundCode,
          input.operationType,
          amount,
          snapshot.beforeHoldingAmount,
          snapshot.afterHoldingAmount,
          snapshot.beforeHoldingProfitAmount,
          snapshot.afterHoldingProfitAmount,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          "PENDING",
          effectiveAt,
          null,
          null,
          null,
          now
        );

      this.db.exec("COMMIT;");
      return {
        id: operationId,
        portfolioId: input.portfolioId,
        fundCode: input.fundCode,
        operationType: input.operationType,
        amount,
        beforeHoldingAmount: snapshot.beforeHoldingAmount,
        afterHoldingAmount: snapshot.afterHoldingAmount,
        beforeHoldingProfitAmount: snapshot.beforeHoldingProfitAmount,
        afterHoldingProfitAmount: snapshot.afterHoldingProfitAmount,
        status: "PENDING",
        effectiveAt,
        createdAt: now
      };
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  async deletePositionOperation(
    userId: string,
    portfolioId: string,
    fundCode: string,
    operationId: string
  ): Promise<DeletePositionOperationResult | undefined> {
    this.settleDuePositionOperations(userId, { portfolioId, fundCode });
    const target = this.getPositionOperationRow(userId, portfolioId, fundCode, operationId);
    if (!target || target.deletedAt) {
      return undefined;
    }

    const now = new Date().toISOString();
    if (target.status === "APPLIED") {
      this.db
        .prepare(
          `
            UPDATE user_portfolio_fund_operation
            SET manual_canceled_at = COALESCE(manual_canceled_at, ?)
            WHERE id = ?
          `
        )
        .run(now, operationId);

      const updated = this.getPositionOperationRow(userId, portfolioId, fundCode, operationId);
      return {
        effect: "MARKED_MANUAL_CANCEL",
        ...(updated ? { operation: this.toPositionOperation(updated) } : {})
      };
    }

    const baseState = this.getPortfolioFundStateSync(userId, portfolioId, fundCode);
    if (!baseState) {
      return undefined;
    }

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db
        .prepare(
          `
            UPDATE user_portfolio_fund_operation
            SET deleted_at = ?
            WHERE id = ?
          `
        )
        .run(now, operationId);

      this.recomputePendingOperationsInTransaction(userId, portfolioId, fundCode, baseState);
      this.db.exec("COMMIT;");
      return {
        effect: "REMOVED"
      };
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  async listPositionOperations(
    userId: string,
    portfolioId: string,
    options?: { limit?: number; fundCode?: string }
  ): Promise<PositionOperationItem[]> {
    const limit = Math.max(1, Math.min(200, Math.floor(options?.limit ?? 50)));
    const fundCode = options?.fundCode?.trim();
    this.settleDuePositionOperations(userId, {
      portfolioId,
      ...(fundCode ? { fundCode } : {})
    });

    const rows = (
      fundCode
        ? this.db
            .prepare(
              `
                SELECT
                  id,
                  portfolio_id AS portfolioId,
                  fund_code AS fundCode,
                  operation_type AS operationType,
                  amount,
                  before_holding_amount AS beforeHoldingAmount,
                  after_holding_amount AS afterHoldingAmount,
                  before_holding_profit_amount AS beforeHoldingProfitAmount,
                  after_holding_profit_amount AS afterHoldingProfitAmount,
                  bind_decision_id AS bindDecisionId,
                  bind_action_order AS bindActionOrder,
                  bind_action_type AS bindActionType,
                  bind_action_fund_code AS bindActionFundCode,
                  bind_action_fund_name AS bindActionFundName,
                  bind_action_risk_level AS bindActionRiskLevel,
                  bind_action_rationale AS bindActionRationale,
                  status,
                  effective_at AS effectiveAt,
                  applied_at AS appliedAt,
                  deleted_at AS deletedAt,
                  manual_canceled_at AS manualCanceledAt,
                  created_at AS createdAt
                FROM user_portfolio_fund_operation
                WHERE user_id = ? AND portfolio_id = ? AND fund_code = ? AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT ?
              `
            )
            .all(userId, portfolioId, fundCode, limit)
        : this.db
            .prepare(
              `
                SELECT
                  id,
                  portfolio_id AS portfolioId,
                  fund_code AS fundCode,
                  operation_type AS operationType,
                  amount,
                  before_holding_amount AS beforeHoldingAmount,
                  after_holding_amount AS afterHoldingAmount,
                  before_holding_profit_amount AS beforeHoldingProfitAmount,
                  after_holding_profit_amount AS afterHoldingProfitAmount,
                  bind_decision_id AS bindDecisionId,
                  bind_action_order AS bindActionOrder,
                  bind_action_type AS bindActionType,
                  bind_action_fund_code AS bindActionFundCode,
                  bind_action_fund_name AS bindActionFundName,
                  bind_action_risk_level AS bindActionRiskLevel,
                  bind_action_rationale AS bindActionRationale,
                  status,
                  effective_at AS effectiveAt,
                  applied_at AS appliedAt,
                  deleted_at AS deletedAt,
                  manual_canceled_at AS manualCanceledAt,
                  created_at AS createdAt
                FROM user_portfolio_fund_operation
                WHERE user_id = ? AND portfolio_id = ? AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT ?
              `
            )
            .all(userId, portfolioId, limit)
    ) as unknown as PositionOperationRow[];

    return rows.map((row) => this.toPositionOperation(row));
  }

  async rollPortfolioFundHoldingByNavDate(userId: string, fundCode: string, navDate: string, dailyReturn: number): Promise<number> {
    this.settleDuePositionOperations(userId, { fundCode });
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
            user_id = ?
            AND fund_code = ?
            AND (last_holding_roll_nav_date IS NULL OR last_holding_roll_nav_date <> ?)
        `
      )
      .run(dailyReturn, dailyReturn, navDate, userId, fundCode, navDate) as SqliteRunResult;

    return toChanges(result);
  }

  async removePortfolioFund(userId: string, portfolioId: string, fundCode: string): Promise<boolean> {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db
        .prepare(
          `
            DELETE FROM user_portfolio_fund_operation
            WHERE user_id = ? AND portfolio_id = ? AND fund_code = ?
          `
        )
        .run(userId, portfolioId, fundCode);

      const result = this.db
        .prepare(
          `
            DELETE FROM user_portfolio_fund
            WHERE user_id = ? AND portfolio_id = ? AND fund_code = ?
          `
        )
        .run(userId, portfolioId, fundCode) as SqliteRunResult;

      const removed = toChanges(result) > 0;
      this.db.exec("COMMIT;");
      if (removed) {
        await this.cleanupOrphanFundStates(userId);
      }
      return removed;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  async validatePortfolioFundSet(userId: string, portfolioId: string, orderedFundCodes: string[]): Promise<boolean> {
    const rows = this.db
      .prepare(
        `
          SELECT fund_code AS fundCode
          FROM user_portfolio_fund
          WHERE user_id = ? AND portfolio_id = ?
        `
      )
      .all(userId, portfolioId) as Array<{ fundCode: string }>;

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

  async reorderPortfolioFunds(userId: string, portfolioId: string, orderedFundCodes: string[]): Promise<void> {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const updateStmt = this.db.prepare(
        `
          UPDATE user_portfolio_fund
          SET display_order = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND portfolio_id = ? AND fund_code = ?
        `
      );

      for (const [index, fundCode] of orderedFundCodes.entries()) {
        const result = updateStmt.run(index, userId, portfolioId, fundCode) as SqliteRunResult;
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

  async sumPlannedRatio(userId: string, portfolioId: string, excludeFundCode?: string): Promise<number> {
    if (excludeFundCode) {
      const row = this.db
        .prepare(
          `
            SELECT COALESCE(SUM(COALESCE(planned_ratio, 0)), 0) AS sumRatio
            FROM user_portfolio_fund
            WHERE user_id = ? AND portfolio_id = ? AND fund_code <> ?
          `
        )
        .get(userId, portfolioId, excludeFundCode) as { sumRatio: number | null } | undefined;

      return Number((row?.sumRatio ?? 0).toFixed(6));
    }

    const row = this.db
      .prepare(
        `
          SELECT COALESCE(SUM(COALESCE(planned_ratio, 0)), 0) AS sumRatio
          FROM user_portfolio_fund
          WHERE user_id = ? AND portfolio_id = ?
        `
      )
      .get(userId, portfolioId) as { sumRatio: number | null } | undefined;

    return Number((row?.sumRatio ?? 0).toFixed(6));
  }

  async getActivePortfolioShareByCode(shareCode: string): Promise<PortfolioShareRecord | undefined> {
    const normalizedCode = shareCode.trim().toUpperCase();
    if (!normalizedCode) {
      return undefined;
    }

    const row = this.db
      .prepare(
        `
          SELECT
            id,
            user_id AS userId,
            portfolio_id AS portfolioId,
            share_code AS shareCode,
            status,
            snapshot_json AS snapshotJson,
            password_hash AS passwordHash,
            expires_at AS expiresAt,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM user_portfolio_share
          WHERE share_code = ? AND status = 'ACTIVE'
          ORDER BY updated_at DESC
          LIMIT 1
        `
      )
      .get(normalizedCode) as PortfolioShareRow | undefined;

    if (!row) {
      return undefined;
    }

    return this.toPortfolioShare(row);
  }

  async replaceActivePortfolioShare(input: {
    userId: string;
    portfolioId: string;
    shareCode: string;
    snapshotJson: string;
    passwordHash?: string;
    expiresAt?: string;
  }): Promise<PortfolioShareRecord> {
    const id = randomUUID();
    const normalizedCode = input.shareCode.trim().toUpperCase();

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db
        .prepare(
          `
            UPDATE user_portfolio_share
            SET status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND portfolio_id = ? AND status = 'ACTIVE'
          `
        )
        .run(input.userId, input.portfolioId);

      this.db
        .prepare(
          `
            INSERT INTO user_portfolio_share (
              id,
              user_id,
              portfolio_id,
              share_code,
              status,
              snapshot_json,
              password_hash,
              expires_at,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `
        )
        .run(
          id,
          input.userId,
          input.portfolioId,
          normalizedCode,
          input.snapshotJson,
          input.passwordHash ?? null,
          input.expiresAt ?? null,
        );

      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }

    const created = await this.getActivePortfolioShareByCode(normalizedCode);
    if (!created || created.id !== id) {
      throw new Error("failed to create portfolio share");
    }

    return created;
  }

  async listUniqueFundCodes(userId: string): Promise<string[]> {
    const rows = this.db
      .prepare(
        `
          SELECT DISTINCT fund_code AS fundCode
          FROM user_portfolio_fund
          WHERE user_id = ?
          ORDER BY fund_code ASC
        `
      )
      .all(userId) as Array<{ fundCode: string }>;

    return rows.map((row) => row.fundCode);
  }

  async listFundStatesByCodes(userId: string, fundCodes: string[]): Promise<Map<string, FundStateItem>> {
    if (fundCodes.length === 0) {
      return new Map();
    }

    const placeholders = fundCodes.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
          SELECT
            user_id AS userId,
            fund_code AS fundCode,
            total_change_pct AS totalChangePct,
            last_accumulated_nav_date AS lastAccumulatedNavDate,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM user_fund_state
          WHERE user_id = ? AND fund_code IN (${placeholders})
        `
      )
      .all(userId, ...fundCodes) as unknown as FundStateRow[];

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

  async ensureFundState(userId: string, fundCode: string): Promise<void> {
    this.db
      .prepare(
        `
          INSERT INTO user_fund_state (user_id, fund_code, total_change_pct, last_accumulated_nav_date, created_at, updated_at)
          VALUES (?, ?, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, fund_code) DO NOTHING
        `
      )
      .run(userId, fundCode);
  }

  async accumulateOfficialReturn(userId: string, fundCode: string, navDate: string, dailyReturn: number): Promise<boolean> {
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
            user_id = ?
            AND fund_code = ?
            AND (last_accumulated_nav_date IS NULL OR last_accumulated_nav_date <> ?)
        `
      )
      .run(dailyReturn, navDate, userId, fundCode, navDate) as SqliteRunResult;

    return toChanges(result) > 0;
  }

  async cleanupOrphanFundStates(userId: string): Promise<void> {
    this.db
      .prepare(
        `
          DELETE FROM user_fund_state
          WHERE user_id = ?
            AND fund_code NOT IN (
              SELECT DISTINCT fund_code
              FROM user_portfolio_fund
              WHERE user_id = ?
            )
        `
      )
      .run(userId, userId);
  }
}

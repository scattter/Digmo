import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DailyDecision, DecisionDocFormat, PortfolioDecisionDoc } from "@digmo/shared";

interface DecisionDocRow {
  id: string;
  portfolioId: string;
  version: number;
  title: string | null;
  format: string;
  content: string;
  sourceFileName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DecisionRunRow {
  id: string;
  portfolioId: string;
  tradeDate: string;
  summary: string;
  provider: string;
  model: string;
  status: "SUCCESS" | "FAILED";
  errorMessage: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  createdAt: string;
}

export interface SaveDecisionRunInput {
  userId: string;
  portfolioId: string;
  tradeDate: string;
  summary: string;
  provider: string;
  model: string;
  status: "SUCCESS" | "FAILED";
  errorMessage?: string;
  latencyMs: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  rawResponse?: string;
  promptSnapshotJson?: string;
}

export interface DecisionStore {
  upsertDecisionDoc(
    userId: string,
    portfolioId: string,
    input: {
      title?: string;
      format: DecisionDocFormat;
      content: string;
      sourceFileName?: string;
    }
  ): Promise<PortfolioDecisionDoc>;
  getActiveDecisionDoc(userId: string, portfolioId: string): Promise<PortfolioDecisionDoc | undefined>;
  saveDecisionRun(input: SaveDecisionRunInput): Promise<DailyDecision>;
  getLatestDecision(userId: string, portfolioId: string): Promise<DailyDecision | undefined>;
  getLatestDecisionByTradeDate(userId: string, portfolioId: string, tradeDate: string): Promise<DailyDecision | undefined>;
  listDecisionHistory(userId: string, portfolioId: string, limit: number): Promise<DailyDecision[]>;
}

function toDoc(row: DecisionDocRow): PortfolioDecisionDoc {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    version: row.version,
    ...(row.title ? { title: row.title } : {}),
    format: row.format === "MARKDOWN" ? "MARKDOWN" : "TEXT",
    content: row.content,
    ...(row.sourceFileName ? { sourceFileName: row.sourceFileName } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class SqliteDecisionStore implements DecisionStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS portfolio_decision_doc (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        portfolio_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        title TEXT,
        format TEXT NOT NULL CHECK(format IN ('TEXT', 'MARKDOWN')),
        content TEXT NOT NULL,
        source_file_name TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id, portfolio_id) REFERENCES user_portfolio(user_id, id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_portfolio_decision_doc_active
        ON portfolio_decision_doc(user_id, portfolio_id)
        WHERE is_active = 1;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_portfolio_decision_doc_version
        ON portfolio_decision_doc(user_id, portfolio_id, version);

      CREATE TABLE IF NOT EXISTS portfolio_daily_decision_run (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        portfolio_id TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        summary TEXT NOT NULL,
        overall_risk_level TEXT NOT NULL CHECK(overall_risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAILED')),
        error_message TEXT,
        prompt_snapshot_json TEXT,
        raw_response_json TEXT,
        latency_ms INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER,
        output_tokens INTEGER,
        total_tokens INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id, portfolio_id) REFERENCES user_portfolio(user_id, id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_portfolio_daily_decision_run_user_portfolio_created
        ON portfolio_daily_decision_run(user_id, portfolio_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS portfolio_daily_decision_action (
        run_id TEXT NOT NULL,
        action_order INTEGER NOT NULL,
        action_type TEXT NOT NULL CHECK(action_type IN ('BUY', 'SELL', 'HOLD', 'REBALANCE')),
        fund_code TEXT NOT NULL,
        fund_name TEXT,
        rationale TEXT NOT NULL,
        target_position_pct REAL,
        target_amount REAL,
        trigger_condition TEXT NOT NULL,
        valid_until TEXT NOT NULL,
        confidence REAL NOT NULL,
        risk_level TEXT NOT NULL CHECK(risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
        requires_second_confirm INTEGER NOT NULL CHECK(requires_second_confirm IN (0, 1)),
        citations_json TEXT NOT NULL,
        PRIMARY KEY (run_id, action_order),
        FOREIGN KEY (run_id) REFERENCES portfolio_daily_decision_run(id) ON DELETE CASCADE
      );
    `);
  }

  async upsertDecisionDoc(
    userId: string,
    portfolioId: string,
    input: {
      title?: string;
      format: DecisionDocFormat;
      content: string;
      sourceFileName?: string;
    }
  ): Promise<PortfolioDecisionDoc> {
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const maxVersionRow = this.db
        .prepare(
          `
            SELECT MAX(version) AS maxVersion
            FROM portfolio_decision_doc
            WHERE user_id = ? AND portfolio_id = ?
          `
        )
        .get(userId, portfolioId) as { maxVersion: number | null } | undefined;
      const version = (maxVersionRow?.maxVersion ?? 0) + 1;

      this.db
        .prepare(
          `
            UPDATE portfolio_decision_doc
            SET is_active = 0, updated_at = ?
            WHERE user_id = ? AND portfolio_id = ? AND is_active = 1
          `
        )
        .run(now, userId, portfolioId);

      const id = randomUUID();
      this.db
        .prepare(
          `
            INSERT INTO portfolio_decision_doc (
              id, user_id, portfolio_id, version, title, format, content, source_file_name, is_active, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          `
        )
        .run(
          id,
          userId,
          portfolioId,
          version,
          input.title?.trim() ? input.title.trim() : null,
          input.format,
          input.content,
          input.sourceFileName?.trim() ? input.sourceFileName.trim() : null,
          now,
          now
        );

      this.db.exec("COMMIT;");
      return {
        id,
        portfolioId,
        version,
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        format: input.format,
        content: input.content,
        ...(input.sourceFileName?.trim() ? { sourceFileName: input.sourceFileName.trim() } : {}),
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  async getActiveDecisionDoc(userId: string, portfolioId: string): Promise<PortfolioDecisionDoc | undefined> {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            portfolio_id AS portfolioId,
            version,
            title,
            format,
            content,
            source_file_name AS sourceFileName,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM portfolio_decision_doc
          WHERE user_id = ? AND portfolio_id = ? AND is_active = 1
          ORDER BY version DESC
          LIMIT 1
        `
      )
      .get(userId, portfolioId) as unknown as DecisionDocRow | undefined;

    return row ? toDoc(row) : undefined;
  }

  async saveDecisionRun(input: SaveDecisionRunInput): Promise<DailyDecision> {
    const now = new Date().toISOString();
    const runId = randomUUID();
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db
        .prepare(
          `
            INSERT INTO portfolio_daily_decision_run (
              id,
              user_id,
              portfolio_id,
              trade_date,
              summary,
              overall_risk_level,
              provider,
              model,
              status,
              error_message,
              prompt_snapshot_json,
              raw_response_json,
              latency_ms,
              input_tokens,
              output_tokens,
              total_tokens,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          runId,
          input.userId,
          input.portfolioId,
          input.tradeDate,
          input.summary,
          "MEDIUM",
          input.provider,
          input.model,
          input.status,
          input.errorMessage ?? null,
          input.promptSnapshotJson ?? null,
          input.rawResponse ?? null,
          input.latencyMs,
          input.usage?.inputTokens ?? null,
          input.usage?.outputTokens ?? null,
          input.usage?.totalTokens ?? null,
          now
        );

      this.db.exec("COMMIT;");
      return {
        id: runId,
        portfolioId: input.portfolioId,
        tradeDate: input.tradeDate,
        summary: input.summary,
        provider: input.provider,
        model: input.model,
        status: input.status,
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
        latencyMs: input.latencyMs,
        usage: {
          inputTokens: input.usage?.inputTokens,
          outputTokens: input.usage?.outputTokens,
          totalTokens: input.usage?.totalTokens
        },
        createdAt: now
      };
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  async getLatestDecision(userId: string, portfolioId: string): Promise<DailyDecision | undefined> {
    const rows = await this.listDecisionHistory(userId, portfolioId, 1);
    return rows[0];
  }

  async getLatestDecisionByTradeDate(
    userId: string,
    portfolioId: string,
    tradeDate: string
  ): Promise<DailyDecision | undefined> {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            portfolio_id AS portfolioId,
            trade_date AS tradeDate,
            summary,
            provider,
            model,
            status,
            error_message AS errorMessage,
            latency_ms AS latencyMs,
            input_tokens AS inputTokens,
            output_tokens AS outputTokens,
            total_tokens AS totalTokens,
            created_at AS createdAt
          FROM portfolio_daily_decision_run
          WHERE user_id = ? AND portfolio_id = ? AND trade_date = ?
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .get(userId, portfolioId, tradeDate) as unknown as DecisionRunRow | undefined;
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      portfolioId: row.portfolioId,
      tradeDate: row.tradeDate,
      summary: row.summary,
      provider: row.provider,
      model: row.model,
      status: row.status,
      ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
      latencyMs: row.latencyMs,
      usage: {
        ...(typeof row.inputTokens === "number" ? { inputTokens: row.inputTokens } : {}),
        ...(typeof row.outputTokens === "number" ? { outputTokens: row.outputTokens } : {}),
        ...(typeof row.totalTokens === "number" ? { totalTokens: row.totalTokens } : {})
      },
      createdAt: row.createdAt
    };
  }

  async listDecisionHistory(userId: string, portfolioId: string, limit: number): Promise<DailyDecision[]> {
    const runRows = this.db
      .prepare(
        `
          SELECT
            id,
            portfolio_id AS portfolioId,
            trade_date AS tradeDate,
            summary,
            provider,
            model,
            status,
            error_message AS errorMessage,
            latency_ms AS latencyMs,
            input_tokens AS inputTokens,
            output_tokens AS outputTokens,
            total_tokens AS totalTokens,
            created_at AS createdAt
          FROM portfolio_daily_decision_run
          WHERE user_id = ? AND portfolio_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `
      )
      .all(userId, portfolioId, limit) as unknown as DecisionRunRow[];

    if (runRows.length === 0) {
      return [];
    }

    return runRows.map((row) => ({
      id: row.id,
      portfolioId: row.portfolioId,
      tradeDate: row.tradeDate,
      summary: row.summary,
      provider: row.provider,
      model: row.model,
      status: row.status,
      ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
      latencyMs: row.latencyMs,
      usage: {
        ...(typeof row.inputTokens === "number" ? { inputTokens: row.inputTokens } : {}),
        ...(typeof row.outputTokens === "number" ? { outputTokens: row.outputTokens } : {}),
        ...(typeof row.totalTokens === "number" ? { totalTokens: row.totalTokens } : {})
      },
      createdAt: row.createdAt
    }));
  }
}

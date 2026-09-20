import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BatchEstimateResponse, ERROR_CODES } from "@digmo/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, test } from "vitest";
import { SqliteWatchlistStore } from "../../infra/watchlist/sqlite-watchlist-store.js";
import { SqliteDecisionStore } from "../../infra/decision/sqlite-decision-store.js";
import { registerAuthRoutes } from "../auth.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { signAccessToken } from "../../modules/auth/token.js";
import { registerWatchlistRoutes } from "../watchlist.js";
import { registerDecisionRoutes } from "../decision.js";
import {
  DecisionAIProvider,
  DecisionGenerationInput,
  DecisionGenerationResult,
} from "../../modules/decision/provider.js";
import { ShareService } from "../../modules/share/service.js";

interface TestCtx {
  root: string;
  dbPath: string;
}

interface DecisionAiConfigInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  mode: "responses" | "chat_completions";
}

const tempRoots: string[] = [];
const TEST_JWT_SECRET = "digmo-test-jwt-secret";

function createTempCtx(): TestCtx {
  const root = mkdtempSync(join(tmpdir(), "digmo-decision-test-"));
  const dbPath = join(root, "watchlist.sqlite");
  tempRoots.push(root);
  return { root, dbPath };
}

async function saveDecisionAiConfig(
  store: SqliteWatchlistStore,
  input?: Partial<DecisionAiConfigInput> & { username?: string }
): Promise<void> {
  const username = input?.username ?? "admin";
  const user = await store.getUserByUsername(username);
  if (!user) {
    throw new Error(`user not found: ${username}`);
  }

  await store.upsertDecisionAiConfig(user.id, {
    baseUrl: input?.baseUrl ?? "https://api.openai.com/v1",
    model: input?.model ?? "stub-model",
    mode: input?.mode ?? "chat_completions",
    apiKey: input?.apiKey ?? "sk-test-123456",
  });
}

function buildProvider(result: DecisionGenerationResult): DecisionAIProvider {
  return {
    name: "stub-provider",
    model: "stub-model",
    async generateDailyDecision() {
      return result;
    }
  };
}

function buildCapturingProvider(result: DecisionGenerationResult) {
  const inputs: DecisionGenerationInput[] = [];
  const provider: DecisionAIProvider = {
    name: "stub-provider",
    model: "stub-model",
    async generateDailyDecision(input) {
      inputs.push(input);
      return result;
    },
  };

  return {
    provider,
    getLastInput() {
      return inputs.at(-1);
    },
  };
}

async function createApp(
  store: SqliteWatchlistStore,
  dbPath: string,
  provider: DecisionAIProvider,
  options?: {
    providerFactory?: (input: DecisionAiConfigInput) => DecisionAIProvider;
    mapEstimates?: (response: BatchEstimateResponse) => BatchEstimateResponse;
  }
) {
  const app = Fastify({ logger: false });

  const service = {
    getBatchEstimates: async (fundCodes: string[]) => {
      const response: BatchEstimateResponse = {
        data: fundCodes.map((fundCode) => ({
          fundCode,
          fundName: `基金${fundCode}`,
          officialNav: 1,
          estimateNav: 1,
          estimateChangePct: 0.012,
          baseNavDate: "2026-03-02",
          estimateTime: new Date().toISOString(),
          confidenceLevel: "HIGH" as const,
          confidenceScore: 100,
          method: "FUND_GZ_DIRECT" as const,
          inputsStalenessSec: 1,
          topHoldings: [],
          disclaimer: "test"
        })),
        partialFailed: []
      };
      return options?.mapEstimates ? options.mapEstimates(response) : response;
    }
  };

  const requireAuth = createRequireAuth({
    store,
    jwtSecret: TEST_JWT_SECRET
  });

  registerAuthRoutes(app, {
    store,
    jwtSecret: TEST_JWT_SECRET,
    accessTokenExpiresInSec: 3600,
    requireAuth
  });

  registerWatchlistRoutes(app, {
    store,
    service: service as never,
    shareService: new ShareService({ store }),
    requireAuth
  });

  registerDecisionRoutes(app, {
    store,
    decisionStore: new SqliteDecisionStore(dbPath),
    service: service as never,
    requireAuth,
    provider,
    ...(options?.providerFactory ? { providerFactory: options.providerFactory } : {})
  } as never);

  const admin = await store.getUserByUsername("admin");
  if (!admin) {
    throw new Error("bootstrap admin not found");
  }

  const token = signAccessToken(
    {
      sub: admin.id,
      username: admin.username,
      role: admin.role
    },
    TEST_JWT_SECRET,
    3600
  );

  app.addHook("onRequest", async (request) => {
    if (!request.headers.authorization) {
      request.headers.authorization = `Bearer ${token}`;
    }
  });

  await app.ready();
  return app;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("decision routes", () => {
  test.each(["partial", "missing", "all", "stale", "invalid"])(
    "rejects %s market data without calling AI or replacing the previous decision",
    async (failure) => {
      const ctx = createTempCtx();
      const store = new SqliteWatchlistStore(ctx.dbPath);
      let fail = false;
      const inputs: DecisionGenerationInput[] = [];
      const app = await createApp(store, ctx.dbPath, {
        name: "stub-provider",
        model: "stub-model",
        async generateDailyDecision(input) {
          inputs.push(input);
          return { summary: "保留原有建议" };
        }
      }, {
        mapEstimates(response) {
          const data = response.data.map((row) => ({ ...row, estimateChangePct: 0.01 }));
          if (!fail) {
            return { data, partialFailed: [] };
          }
          if (failure === "all") {
            return { data: [], partialFailed: data.map((row) => row.fundCode) };
          }
          if (failure === "partial" || failure === "missing") {
            return { data: data.filter((row) => row.fundCode !== "110011"), partialFailed: failure === "partial" ? ["110011"] : [] };
          }
          return {
            data: data.map((row) => row.fundCode !== "110011" ? row : {
              ...row,
              ...(failure === "stale"
                ? { estimateTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }
                : { estimateChangePct: Number.NaN })
            }),
            partialFailed: []
          };
        }
      });

      const created = await app.inject({ method: "POST", url: "/v1/portfolios", payload: { name: "行情校验", type: "FREE" } });
      const portfolioId = created.json().portfolio.id as string;
      for (const fundCode of ["161725", "110011"]) {
        const added = await app.inject({
          method: "POST", url: `/v1/portfolios/${portfolioId}/funds`, payload: { fundCode, holdingAmount: 0.49 }
        });
        expect(added.statusCode).toBe(201);
      }
      await app.inject({
        method: "PUT", url: `/v1/portfolios/${portfolioId}/decision-doc`, payload: { format: "TEXT", content: "测试策略" }
      });
      await saveDecisionAiConfig(store);
      const generated = await app.inject({ method: "POST", url: `/v1/portfolios/${portfolioId}/daily-decision:generate` });
      expect(generated.statusCode).toBe(200);
      const previous = generated.json().decision;
      expect(inputs).toHaveLength(1);
      expect(inputs[0].portfolio.dailyProfitPct).toBe(0);

      fail = true;
      const rejected = await app.inject({ method: "POST", url: `/v1/portfolios/${portfolioId}/daily-decision:generate` });
      expect(rejected.statusCode).toBe(503);
      expect(rejected.json()).toMatchObject({ code: ERROR_CODES.DATA_SOURCE_UNAVAILABLE });
      expect(rejected.json().message).toContain("110011");
      expect(inputs).toHaveLength(1);
      const latest = await app.inject({ method: "GET", url: `/v1/portfolios/${portfolioId}/daily-decision/latest` });
      expect(latest.json().decision.id).toBe(previous.id);
      expect(latest.json().decision.summary).toBe("保留原有建议");
      const history = await app.inject({ method: "GET", url: `/v1/portfolios/${portfolioId}/daily-decision/history` });
      expect(history.json().items).toHaveLength(1);
      await app.close();
    }
  );

  test("saves and reads active decision doc", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createApp(
      store,
      ctx.dbPath,
      buildProvider({
        summary: "今日建议偏防守",
        usage: {
          inputTokens: 100,
          outputTokens: 200,
          totalTokens: 300
        },
        rawResponse: "{}"
      })
    );

    const createPortfolioResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: {
        name: "测试组合",
        type: "FREE"
      }
    });
    expect(createPortfolioResp.statusCode).toBe(201);
    const portfolioId = (createPortfolioResp.json() as { portfolio: { id: string } }).portfolio.id;

    const putDocResp = await app.inject({
      method: "PUT",
      url: `/v1/portfolios/${portfolioId}/decision-doc`,
      payload: {
        title: "组合策略",
        format: "MARKDOWN",
        content: "# 纪律\n- 波动>3%不追涨"
      }
    });
    expect(putDocResp.statusCode).toBe(200);

    const getDocResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/decision-doc`
    });
    expect(getDocResp.statusCode).toBe(200);
    const docPayload = getDocResp.json() as {
      doc: { title?: string; format: string; content: string; version: number };
    };
    expect(docPayload.doc.title).toBe("组合策略");
    expect(docPayload.doc.format).toBe("MARKDOWN");
    expect(docPayload.doc.content).toContain("波动>3%不追涨");
    expect(docPayload.doc.version).toBe(1);

    await app.close();
  });

  test("generates and persists daily decision", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createApp(
      store,
      ctx.dbPath,
      buildProvider({
        summary: "波动偏高，建议轻微再平衡",
        usage: {
          inputTokens: 120,
          outputTokens: 180,
          totalTokens: 300
        },
        rawResponse: "{}"
      })
    );

    const createPortfolioResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: {
        name: "建议组合",
        type: "FREE"
      }
    });
    expect(createPortfolioResp.statusCode).toBe(201);
    const portfolioId = (createPortfolioResp.json() as { portfolio: { id: string } }).portfolio.id;

    const addFundResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: {
        fundCode: "161725",
        holdingAmount: 10000
      }
    });
    expect(addFundResp.statusCode).toBe(201);

    await app.inject({
      method: "PUT",
      url: `/v1/portfolios/${portfolioId}/decision-doc`,
      payload: {
        title: "执行纪律",
        format: "TEXT",
        content: "高位不追涨，遇回撤再分批加仓"
      }
    });
    await saveDecisionAiConfig(store);

    const generateResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/daily-decision:generate`
    });
    expect(generateResp.statusCode).toBe(200);

    const latestResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/daily-decision/latest`
    });
    expect(latestResp.statusCode).toBe(200);
    const latestPayload = latestResp.json() as {
      decision: {
        summary: string;
        provider: string;
        model: string;
        status: string;
      };
    };
    expect(latestPayload.decision.summary).toContain("建议");
    expect(latestPayload.decision.provider).toBe("stub-provider");
    expect(latestPayload.decision.model).toBe("stub-model");
    expect(latestPayload.decision.status).toBe("SUCCESS");

    const historyResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/daily-decision/history`
    });
    expect(historyResp.statusCode).toBe(200);
    const historyPayload = historyResp.json() as {
      items: Array<{ id: string }>;
    };
    expect(historyPayload.items.length).toBeGreaterThan(0);

    await app.close();
  });

  test("rejects decision generation when no doc bound", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createApp(
      store,
      ctx.dbPath,
      buildProvider({
        summary: "",
        rawResponse: "{}"
      })
    );

    const createPortfolioResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: {
        name: "空文档组合",
        type: "FREE"
      }
    });
    const portfolioId = (createPortfolioResp.json() as { portfolio: { id: string } }).portfolio.id;
    await saveDecisionAiConfig(store);

    const generateResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/daily-decision:generate`
    });

    expect(generateResp.statusCode).toBe(400);
    expect((generateResp.json() as { message: string }).message).toContain("decision doc");

    await app.close();
  });

  test("requires decision ai config before generating", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createApp(
      store,
      ctx.dbPath,
      buildProvider({
        summary: "不应被使用",
        rawResponse: "{}"
      })
    );

    const createPortfolioResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: {
        name: "未配置模型组合",
        type: "FREE"
      }
    });
    const portfolioId = (createPortfolioResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: {
        fundCode: "161725",
        holdingAmount: 10000
      }
    });

    await app.inject({
      method: "PUT",
      url: `/v1/portfolios/${portfolioId}/decision-doc`,
      payload: {
        format: "TEXT",
        content: "test"
      }
    });

    const generateResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/daily-decision:generate`
    });
    expect(generateResp.statusCode).toBe(400);
    expect((generateResp.json() as { code: string }).code).toBe("DECISION_AI_CONFIG_REQUIRED");

    await app.close();
  });

  test("wraps provider failure into 502", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const app = await createApp(
      store,
      ctx.dbPath,
      {
        name: "stub-provider",
        model: "stub-model",
        async generateDailyDecision() {
          throw new Error("provider failed");
        }
      }
    );

    const createPortfolioResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: {
        name: "无来源组合",
        type: "FREE"
      }
    });
    const portfolioId = (createPortfolioResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: {
        fundCode: "161725",
        holdingAmount: 10000
      }
    });

    await app.inject({
      method: "PUT",
      url: `/v1/portfolios/${portfolioId}/decision-doc`,
      payload: {
        format: "TEXT",
        content: "test"
      }
    });
    await saveDecisionAiConfig(store);

    const generateResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/daily-decision:generate`
    });
    expect(generateResp.statusCode).toBe(502);
    expect((generateResp.json() as { code: string }).code).toBe("DECISION_GENERATION_FAILED");

    await app.close();
  });

  test("passes operation history and estimate metrics to provider", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const capture = buildCapturingProvider({
      summary: "建议继续观察",
    });
    const app = await createApp(store, ctx.dbPath, capture.provider);

    const createPortfolioResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: {
        name: "输入校验组合",
        type: "FREE",
      },
    });
    const portfolioId = (createPortfolioResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: {
        fundCode: "161725",
        holdingAmount: 10000,
      },
    });

    await app.inject({
      method: "PUT",
      url: `/v1/portfolios/${portfolioId}/decision-doc`,
      payload: {
        format: "TEXT",
        content: "test-doc",
      },
    });
    await saveDecisionAiConfig(store);

    const operationResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds/161725/position-operations`,
      payload: {
        operationType: "INCREASE",
        amount: 200,
      },
    });
    expect(operationResp.statusCode).toBe(201);

    const generateResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/daily-decision:generate`,
    });
    expect(generateResp.statusCode).toBe(200);

    const input = capture.getLastInput();
    expect(input).toBeTruthy();
    expect(input?.operationHistory.length).toBe(1);
    expect(input?.operationHistory[0]).toMatchObject({
      fundCode: "161725",
      operationType: "INCREASE",
      amount: 200,
    });

    expect(input?.portfolio.funds[0]).toMatchObject({
      fundCode: "161725",
      estimateChangePct: 0.012,
      officialNavDate: "2026-03-02",
    });

    await app.close();
  });

  test("uses saved decision ai config to create provider and persists configured model", async () => {
    const ctx = createTempCtx();
    const store = new SqliteWatchlistStore(ctx.dbPath);
    const factoryInputs: DecisionAiConfigInput[] = [];
    const app = await createApp(
      store,
      ctx.dbPath,
      buildProvider({
        summary: "进程级 provider 不应被使用",
        rawResponse: "{}"
      }),
      {
        providerFactory(input) {
          factoryInputs.push(input);
          return {
            name: "stub-provider",
            model: input.model,
            async generateDailyDecision() {
              return {
                summary: `使用 ${input.model} 生成建议`,
                usage: {
                  inputTokens: 1,
                  outputTokens: 1,
                  totalTokens: 2
                },
                rawResponse: "{}"
              };
            }
          };
        }
      }
    );

    await saveDecisionAiConfig(store, {
      baseUrl: "https://openrouter.ai/api/v1",
      model: "claude-3.7-sonnet",
      apiKey: "sk-user-123456"
    });

    const createPortfolioResp = await app.inject({
      method: "POST",
      url: "/v1/portfolios",
      payload: {
        name: "个性化模型组合",
        type: "FREE"
      }
    });
    const portfolioId = (createPortfolioResp.json() as { portfolio: { id: string } }).portfolio.id;

    await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/funds`,
      payload: {
        fundCode: "161725",
        holdingAmount: 10000
      }
    });

    await app.inject({
      method: "PUT",
      url: `/v1/portfolios/${portfolioId}/decision-doc`,
      payload: {
        format: "TEXT",
        content: "test"
      }
    });

    const generateResp = await app.inject({
      method: "POST",
      url: `/v1/portfolios/${portfolioId}/daily-decision:generate`
    });
    expect(generateResp.statusCode).toBe(200);

    const latestResp = await app.inject({
      method: "GET",
      url: `/v1/portfolios/${portfolioId}/daily-decision/latest`
    });
    expect(latestResp.statusCode).toBe(200);
    expect((latestResp.json() as { decision: { model: string; summary: string } }).decision).toMatchObject({
      model: "claude-3.7-sonnet",
      summary: "使用 claude-3.7-sonnet 生成建议"
    });

    expect(factoryInputs).toEqual([
      {
        baseUrl: "https://openrouter.ai/api/v1",
        model: "claude-3.7-sonnet",
        mode: "chat_completions",
        apiKey: "sk-user-123456"
      }
    ]);

    await app.close();
  });
});

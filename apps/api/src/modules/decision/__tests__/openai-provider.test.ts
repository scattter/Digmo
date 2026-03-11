import { afterEach, describe, expect, test, vi } from "vitest";
import { DecisionGenerationInput } from "../provider.js";
import { OpenAIDecisionProvider } from "../openai-provider.js";

function createInput(overrides?: Partial<DecisionGenerationInput>): DecisionGenerationInput {
  const base: DecisionGenerationInput = {
    asOf: "2026-03-07T08:00:00.000Z",
    timezone: "Asia/Shanghai",
    portfolio: {
      id: "p1",
      name: "组合1",
      type: "FREE",
      totalAmount: 10000,
      totalProfitAmount: 500,
      dailyProfitPct: 0.01,
      funds: [
        {
          fundCode: "161725",
          fundName: "招商中证白酒指数",
          holdingAmount: 10000,
          holdingProfitAmount: 500,
          holdingProfitPct: 0.052,
          estimateChangePct: 0.01,
          dailyProfitPct: 0.01
        }
      ]
    },
    operationHistory: [],
    decisionDoc: {
      title: "策略文档",
      format: "TEXT",
      content: "纪律：不追涨，控制回撤。",
      version: 1
    }
  };

  return {
    ...base,
    ...overrides,
    portfolio: {
      ...base.portfolio,
      ...(overrides?.portfolio ?? {})
    },
    decisionDoc: {
      ...base.decisionDoc,
      ...(overrides?.decisionDoc ?? {})
    }
  };
}

function buildValidDecisionJson(): string {
  return JSON.stringify({
    summary: "波动较大，建议防守",
    overallRiskLevel: "MEDIUM",
    actions: [
      {
        actionType: "HOLD",
        fundCode: "161725",
        rationale: "短期波动扩大",
        triggerCondition: "观察3个交易日",
        validUntil: "2026-03-08T08:00:00.000Z",
        confidence: 0.67,
        riskLevel: "MEDIUM",
        requiresSecondConfirm: false,
        citations: [
          {
            title: "策略文档",
            snippet: "波动期保持仓位",
            sourceType: "portfolio_doc"
          }
        ]
      }
    ]
  });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("OpenAIDecisionProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("uses custom base url and sends request to /v1/responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        output_text: buildValidDecisionJson(),
        usage: { input_tokens: 101, output_tokens: 55, total_tokens: 156 }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIDecisionProvider({
      apiKey: "test-key",
      model: "test-model",
      timeoutMs: 5000,
      maxOutputTokens: 1200,
      enableWebSearch: false,
      baseUrl: "https://llm-gateway.example.com"
    });

    const result = await provider.generateDailyDecision(createInput());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://llm-gateway.example.com/v1/responses");
    expect(result.summary).toContain("防守");
    expect(result.usage?.totalTokens).toBe(156);
  });

  test("uses /responses directly when base url already ends with /v1", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        output_text: buildValidDecisionJson(),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIDecisionProvider({
      apiKey: "test-key",
      model: "test-model",
      timeoutMs: 5000,
      maxOutputTokens: 1200,
      enableWebSearch: false,
      baseUrl: "https://gateway.example.com/openapi/compatible-mode/v1",
    });

    await provider.generateDailyDecision(createInput());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://gateway.example.com/openapi/compatible-mode/v1/responses",
    );
  });

  test("falls back to /v1/chat/completions when responses endpoint is unsupported", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("not found /v1/responses", { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: buildValidDecisionJson() } }],
          usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIDecisionProvider({
      apiKey: "test-key",
      model: "test-model",
      timeoutMs: 5000,
      maxOutputTokens: 1200,
      enableWebSearch: false,
      baseUrl: "https://compat.example.com"
    });

    const result = await provider.generateDailyDecision(createInput());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://compat.example.com/v1/responses");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://compat.example.com/v1/chat/completions");
    expect(result.usage?.inputTokens).toBe(120);
    expect(result.usage?.outputTokens).toBe(60);
  });

  test("does not fall back for unauthorized responses failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIDecisionProvider({
      apiKey: "test-key",
      model: "test-model",
      timeoutMs: 5000,
      maxOutputTokens: 1200,
      enableWebSearch: false,
      baseUrl: "https://compat.example.com"
    });

    await expect(provider.generateDailyDecision(createInput())).rejects.toThrowError(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://compat.example.com/v1/responses");
  });

  test("falls back to plain text suggestion when structured output is non-json", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unsupported endpoint", { status: 501 }))
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "plain text without JSON" } }]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "今日趋势：震荡偏弱。\n操作建议：以持有为主，减少频繁交易。\n风险提示：注意回撤控制。" } }],
          usage: { prompt_tokens: 90, completion_tokens: 45, total_tokens: 135 }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIDecisionProvider({
      apiKey: "test-key",
      model: "test-model",
      timeoutMs: 5000,
      maxOutputTokens: 1200,
      enableWebSearch: false,
      baseUrl: "https://compat.example.com"
    });

    const result = await provider.generateDailyDecision(createInput());

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://compat.example.com/v1/chat/completions");
    expect(result.summary).toContain("今日趋势");
    expect(result.actions).toHaveLength(0);
    expect(result.overallRiskLevel).toBe("MEDIUM");
    expect(result.usage?.totalTokens).toBe(135);
  });

  test("truncates decision doc content before sending to model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        output_text: buildValidDecisionJson()
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const longContent = "1234567890ABCDEFGHIJ";
    const input = createInput({
      decisionDoc: {
        format: "TEXT",
        content: longContent,
        version: 1
      }
    });

    const provider = new OpenAIDecisionProvider({
      apiKey: "test-key",
      model: "test-model",
      timeoutMs: 5000,
      maxOutputTokens: 1200,
      enableWebSearch: false,
      docMaxChars: 12
    });

    await provider.generateDailyDecision(input);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      input: Array<{ role: string; content: Array<{ type: string; text: string }> }>;
    };
    const userText = body.input.find((item) => item.role === "user")?.content[0]?.text;
    const userPayload = JSON.parse(String(userText)) as DecisionGenerationInput;

    expect(userPayload.decisionDoc.content).toBe(longContent.slice(0, 12));
    expect(input.decisionDoc.content).toBe(longContent);
  });

  test("keeps operation history and dual daily change fields in user payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        output_text: buildValidDecisionJson(),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const input = createInput({
      portfolio: {
        ...createInput().portfolio,
        funds: [
          {
            fundCode: "161725",
            fundName: "招商中证白酒指数",
            holdingAmount: 10000,
            holdingProfitAmount: 500,
            holdingProfitPct: 0.052,
            estimateChangePct: 0.012,
            dailyProfitPct: 0.012,
            officialDailyReturn: 0.009,
            officialNavDate: "2026-03-07",
          },
        ],
      },
      operationHistory: [
        {
          createdAt: "2026-03-07T08:10:00.000Z",
          fundCode: "161725",
          operationType: "INCREASE",
          amount: 300,
          beforeHoldingAmount: 9700,
          afterHoldingAmount: 10000,
          beforeHoldingProfitAmount: 470,
          afterHoldingProfitAmount: 500,
        },
      ],
    });

    const provider = new OpenAIDecisionProvider({
      apiKey: "test-key",
      model: "test-model",
      timeoutMs: 5000,
      maxOutputTokens: 1200,
      enableWebSearch: false,
    });

    await provider.generateDailyDecision(input);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      input: Array<{ role: string; content: Array<{ type: string; text: string }> }>;
    };
    const userText = body.input.find((item) => item.role === "user")?.content[0]?.text;
    const userPayload = JSON.parse(String(userText)) as DecisionGenerationInput;

    expect(userPayload.operationHistory).toHaveLength(1);
    expect(userPayload.operationHistory[0]?.operationType).toBe("INCREASE");
    expect(userPayload.portfolio.funds[0]?.estimateChangePct).toBe(0.012);
    expect(userPayload.portfolio.funds[0]?.officialDailyReturn).toBe(0.009);
    expect(userPayload.portfolio.funds[0]?.officialNavDate).toBe("2026-03-07");
  });
});

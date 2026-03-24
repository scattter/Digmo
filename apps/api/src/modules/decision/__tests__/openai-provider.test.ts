import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DecisionGenerationInput } from "../provider.js";

const { openAIConstructorSpy, chatCompletionCreateSpy } = vi.hoisted(() => ({
  openAIConstructorSpy: vi.fn(),
  chatCompletionCreateSpy: vi.fn(),
}));

vi.mock("openai", () => {
  class OpenAI {
    chat = {
      completions: {
        create: chatCompletionCreateSpy,
      },
    };

    constructor(options: unknown) {
      openAIConstructorSpy(options);
    }
  }

  return {
    default: OpenAI,
  };
});

import { OpenAIDecisionProvider } from "../openai-provider.js";

function createInput(
  overrides?: Partial<DecisionGenerationInput>,
): DecisionGenerationInput {
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
          dailyProfitPct: 0.01,
        },
      ],
    },
    operationHistory: [],
    decisionDoc: {
      title: "策略文档",
      format: "TEXT",
      content: "纪律：不追涨，控制回撤。",
      version: 1,
    },
  };

  return {
    ...base,
    ...overrides,
    portfolio: {
      ...base.portfolio,
      ...(overrides?.portfolio ?? {}),
    },
    decisionDoc: {
      ...base.decisionDoc,
      ...(overrides?.decisionDoc ?? {}),
    },
  };
}

function buildValidDecisionText(): string {
  return [
    "今日建议：以防守为主，暂不追涨。",
    "组合观察：白酒仓位短线波动扩大，但暂未触发破位。",
    "执行原则：继续按策略文档控制回撤，等待更清晰的加仓窗口。",
  ].join("\n");
}

function buildProvider(
  overrides?: Partial<ConstructorParameters<typeof OpenAIDecisionProvider>[0]>,
): OpenAIDecisionProvider {
  return new OpenAIDecisionProvider({
    apiKey: "test-key",
    model: "gpt-4o-mini",
    timeoutMs: 5000,
    maxOutputTokens: 1200,
    baseUrl: "https://api.bltcy.ai/v1",
    ...overrides,
  });
}

describe("OpenAIDecisionProvider", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("fetch should not be called");
      }),
    );
    openAIConstructorSpy.mockReset();
    chatCompletionCreateSpy.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("uses OpenAI SDK chat completions with baseURL and only model/messages", async () => {
    chatCompletionCreateSpy.mockResolvedValue({
      choices: [{ message: { content: buildValidDecisionText() } }],
      usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
    });

    const provider = buildProvider();

    const result = await provider.generateDailyDecision(createInput());

    expect(openAIConstructorSpy).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://api.bltcy.ai/v1",
      maxRetries: 0,
      timeout: 5000,
    });
    expect(chatCompletionCreateSpy).toHaveBeenCalledTimes(1);
    expect(chatCompletionCreateSpy).toHaveBeenCalledWith({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: expect.any(String),
        },
        {
          role: "user",
          content: expect.any(String),
        },
      ],
    });

    expect(result.summary).toContain("防守");
    expect(result.usage?.inputTokens).toBe(120);
    expect(result.usage?.outputTokens).toBe(60);
    expect(result.usage?.totalTokens).toBe(180);
    expect(result.rawResponse).toBe(buildValidDecisionText());
  });

  test("uses compat chat completions transport for third-party compatible models", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: buildValidDecisionText() } }],
          usage: { prompt_tokens: 140, completion_tokens: 70, total_tokens: 210 },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = buildProvider({
      model: "glm-5",
      baseUrl: "https://compat.example.com/openapi/compatible-mode/v1",
      maxOutputTokens: 1800,
    });

    const result = await provider.generateDailyDecision(createInput());

    expect(openAIConstructorSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://compat.example.com/openapi/compatible-mode/v1/chat/completions",
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };

    expect(body.model).toBe("glm-5");
    expect(body.max_tokens).toBe(1024);
    expect(body.messages[0]).toEqual({
      role: "system",
      content: expect.any(String),
    });
    expect(body.messages[1]).toEqual({
      role: "user",
      content: expect.any(String),
    });
    expect(result.usage?.totalTokens).toBe(210);
  });

  test("sanitizes malformed compat baseUrl before building chat completions endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: buildValidDecisionText() } }],
          usage: { prompt_tokens: 140, completion_tokens: 70, total_tokens: 210 },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = buildProvider({
      model: "MiniMax-M2.5",
      baseUrl:
        "https://api.xairouter.com/v1#https://ai.td.ee/v1#https://api.xairouter.com/v1",
    });

    await provider.generateDailyDecision(createInput());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.xairouter.com/v1/chat/completions",
    );
  });

  test("clamps compat chat completions max_tokens to provider-safe latency budget", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: buildValidDecisionText() } }],
          usage: { prompt_tokens: 140, completion_tokens: 70, total_tokens: 210 },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = buildProvider({
      model: "MiniMax-M2.5",
      baseUrl: "https://api.xairouter.com/v1",
      maxOutputTokens: 128000,
    });

    await provider.generateDailyDecision(createInput());

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      max_tokens: number;
    };

    expect(body.max_tokens).toBe(1024);
  });

  test("retries compat chat completions when upstream returns 5xx once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("upstream unavailable", {
          status: 502,
          headers: {
            "content-type": "text/plain",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: buildValidDecisionText() } }],
            usage: { prompt_tokens: 140, completion_tokens: 70, total_tokens: 210 },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = buildProvider({
      model: "MiniMax-M2.5",
      baseUrl: "https://api.xairouter.com/v1",
    });

    await expect(provider.generateDailyDecision(createInput())).resolves.toMatchObject({
      summary: buildValidDecisionText(),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("retries compat chat completions when upstream returns no output text once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "",
                  reasoning_content: "思考过程",
                },
                finish_reason: "stop",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: buildValidDecisionText() } }],
            usage: { prompt_tokens: 140, completion_tokens: 70, total_tokens: 210 },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = buildProvider({
      model: "MiniMax-M2.5",
      baseUrl: "https://api.xairouter.com/v1",
    });

    await expect(provider.generateDailyDecision(createInput())).resolves.toMatchObject({
      summary: buildValidDecisionText(),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("retries compat chat completions when upstream returns malformed json once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("{\"choices\":[", {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: buildValidDecisionText() } }],
            usage: { prompt_tokens: 140, completion_tokens: 70, total_tokens: 210 },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = buildProvider({
      model: "MiniMax-M2.5",
      baseUrl: "https://api.xairouter.com/v1",
    });

    await expect(provider.generateDailyDecision(createInput())).resolves.toMatchObject({
      summary: buildValidDecisionText(),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("retries compat chat completions when first attempt times out", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_: RequestInfo | URL, init?: RequestInit) => {
        return new Promise((_, reject) => {
          const signal = init?.signal;
          signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      })
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: buildValidDecisionText() } }],
            usage: { prompt_tokens: 140, completion_tokens: 70, total_tokens: 210 },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = buildProvider({
      model: "MiniMax-M2.5",
      baseUrl: "https://api.xairouter.com/v1",
      timeoutMs: 20_000,
    });

    const pending = provider.generateDailyDecision(createInput());

    await vi.advanceTimersByTimeAsync(75_000);
    await Promise.resolve();

    await expect(pending).resolves.toMatchObject({
      summary: buildValidDecisionText(),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  test("uses a longer timeout floor for compat chat completions", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = buildProvider({
      model: "MiniMax-M2.5",
      baseUrl: "https://api.xairouter.com/v1",
      timeoutMs: 20_000,
    });

    let settled = false;
    let rejection: unknown;
    const pending = provider.generateDailyDecision(createInput()).then(
      () => {
        settled = true;
      },
      (error) => {
        settled = true;
        rejection = error;
      },
    );

    await vi.advanceTimersByTimeAsync(20_000);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(54_000);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(74_000);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    await pending;
    expect(settled).toBe(true);
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe("Request timed out.");
    vi.useRealTimers();
  });

  test("keeps system prompt and serializes trimmed decision payload into user message", async () => {
    chatCompletionCreateSpy.mockResolvedValue({
      choices: [{ message: { content: buildValidDecisionText() } }],
    });

    const longContent = "1234567890ABCDEFGHIJ";
    const input = createInput({
      decisionDoc: {
        format: "TEXT",
        content: longContent,
        version: 1,
      },
    });

    const provider = buildProvider({
      docMaxChars: 12,
      systemPrompt: "custom system prompt",
    });

    await provider.generateDailyDecision(input);

    const call = chatCompletionCreateSpy.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(call.messages[0]).toEqual({
      role: "system",
      content: "custom system prompt",
    });

    const userPayload = JSON.parse(call.messages[1]!.content) as DecisionGenerationInput;
    expect(userPayload.decisionDoc.content).toBe(longContent.slice(0, 12));
    expect(input.decisionDoc.content).toBe(longContent);
  });

  test("accepts plain text sdk output", async () => {
    chatCompletionCreateSpy.mockResolvedValue({
      choices: [{ message: { content: "plain text without JSON" } }],
    });

    const provider = buildProvider();

    await expect(provider.generateDailyDecision(createInput())).resolves.toMatchObject({
      summary: "plain text without JSON",
      rawResponse: "plain text without JSON",
    });
  });

  test("accepts text wrapped in markdown fences", async () => {
    chatCompletionCreateSpy.mockResolvedValue({
      choices: [
        {
          message: {
            content: "```text\n建议减仓高波动仓位，保留现金等待回撤结束。\n```",
          },
        },
      ],
    });

    const provider = buildProvider();

    await expect(provider.generateDailyDecision(createInput())).resolves.toMatchObject({
      summary: "建议减仓高波动仓位，保留现金等待回撤结束。",
    });
  });

  test("strips markdown headings and emphasis from output text", async () => {
    chatCompletionCreateSpy.mockResolvedValue({
      choices: [
        {
          message: {
            content: "## 今日建议\n\n### 整体判断\n组合当前处于**中度亏损**状态。",
          },
        },
      ],
    });

    const provider = buildProvider();

    await expect(provider.generateDailyDecision(createInput())).resolves.toMatchObject({
      summary: "今日建议\n\n整体判断\n组合当前处于中度亏损状态。",
      rawResponse: "今日建议\n\n整体判断\n组合当前处于中度亏损状态。",
    });
  });

  test("keeps only final answer when think content leaks into message content", async () => {
    chatCompletionCreateSpy.mockResolvedValue({
      choices: [
        {
          message: {
            content: "<think>先分析持仓和风险</think>\n## 建议\n\n优先降低非目标持仓，保留现金。",
          },
        },
      ],
    });

    const provider = buildProvider();

    await expect(provider.generateDailyDecision(createInput())).resolves.toMatchObject({
      summary: "建议\n\n优先降低非目标持仓，保留现金。",
      rawResponse: "建议\n\n优先降低非目标持仓，保留现金。",
    });
  });

  test("throws when OPENAI_API_KEY is not configured", async () => {
    const provider = buildProvider({
      apiKey: undefined,
    });

    await expect(provider.generateDailyDecision(createInput())).rejects.toThrowError(
      /OPENAI_API_KEY is not configured/,
    );
    expect(chatCompletionCreateSpy).not.toHaveBeenCalled();
  });
});

import {
  DecisionAIProvider,
  DecisionGenerationInput,
  DecisionGenerationResult,
  validateDecisionGenerationResult,
} from "./provider";

interface OpenAIDecisionProviderOptions {
  apiKey?: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  enableWebSearch: boolean;
  baseUrl?: string;
  systemPrompt?: string;
  docMaxChars?: number;
}

interface OpenAIUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

interface OpenAIResponsePayload {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: OpenAIUsage;
}

interface OpenAIChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenAIChatPayload {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  usage?: OpenAIChatUsage;
}

const RESPONSES_FALLBACK_STATUS_CODES = new Set([404, 405, 415, 422, 501]);
const DEFAULT_DOC_MAX_CHARS = 12_000;
const PLAIN_TEXT_FALLBACK_SYSTEM_PROMPT = [
  "你是基金组合交易决策助手，根据组合的历史操作，当前持仓，当日涨跌，组合策略文档要求给出操作建议。",
  "请输出简洁中文纯文本建议，必须包含以下小节, 且需要严格按照顺序返回：",
  "具体操作：只给出具体基金的调仓/加仓/减仓，不需要其他内容。",
  "今日趋势：一句话说明盘面或组合变化方向。",
  "相关建议：结合历史操作与组合策略文档给出具体操作的理由。",
  "风险提示：一句话说明主要风险点与注意事项。",
  "不要输出 Markdown 代码块，要有清晰的换行结构。",
  "不要推荐组合外基金。",
].join("\n");

const DECISION_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "overallRiskLevel", "actions"],
  properties: {
    summary: { type: "string" },
    overallRiskLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    actions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "actionType",
          "fundCode",
          "rationale",
          "triggerCondition",
          "validUntil",
          "confidence",
          "riskLevel",
          "requiresSecondConfirm",
          "citations",
        ],
        properties: {
          actionType: {
            type: "string",
            enum: ["BUY", "SELL", "HOLD", "REBALANCE"],
          },
          fundCode: { type: "string" },
          fundName: { type: "string" },
          rationale: { type: "string" },
          targetPositionPct: { type: "number" },
          targetAmount: { type: "number" },
          triggerCondition: { type: "string" },
          validUntil: { type: "string" },
          confidence: { type: "number" },
          riskLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
          requiresSecondConfirm: { type: "boolean" },
          citations: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "snippet", "sourceType"],
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                snippet: { type: "string" },
                sourceType: {
                  type: "string",
                  enum: [
                    "portfolio_doc",
                    "market_context",
                    "world_context",
                    "portfolio_data",
                    "other",
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
};

const DEFAULT_SYSTEM_PROMPT = [
  "你是一个基金组合交易决策助手，必须输出强指令建议（买入、卖出、持有、再平衡）。",
  "你必须严格依据用户组合数据、策略文档、以及联网检索到的最新市场/世界信息。",
  "每条建议必须包含可追溯来源 citations，且 citations 不能为空。",
  "如果风险高（如明显加仓/减仓），requiresSecondConfirm 必须为 true，riskLevel 必须为 HIGH。",
  "必须仅针对组合内基金给建议，不得推荐组合外基金。",
  "你只能输出满足 JSON Schema 的 JSON，不要输出任何额外文本。",
].join("\n");

function extractOutputText(payload: OpenAIResponsePayload): string | undefined {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const texts: string[] = [];
  for (const item of payload.output ?? []) {
    for (const block of item.content ?? []) {
      if (typeof block.text === "string" && block.text.trim()) {
        texts.push(block.text.trim());
      }
    }
  }
  return texts.length > 0 ? texts.join("\n") : undefined;
}

function extractChatOutputText(payload: OpenAIChatPayload): string | undefined {
  const firstContent = payload.choices?.[0]?.message?.content;
  if (typeof firstContent === "string" && firstContent.trim()) {
    return firstContent.trim();
  }

  if (Array.isArray(firstContent)) {
    const texts = firstContent
      .map((item) => (typeof item.text === "string" ? item.text.trim() : ""))
      .filter(Boolean);
    if (texts.length > 0) {
      return texts.join("\n");
    }
  }

  return undefined;
}

function toOpenAIRequestError(status: number, detail: string): Error {
  return new Error(`openai request failed: ${status} ${detail}`);
}

function shouldFallbackToChat(status: number, detail: string): boolean {
  if (RESPONSES_FALLBACK_STATUS_CODES.has(status)) {
    return true;
  }

  const normalized = detail.toLowerCase();
  if (normalized.includes("unsupported")) {
    return true;
  }
  if (normalized.includes("not support")) {
    return true;
  }
  if (normalized.includes("unknown endpoint")) {
    return true;
  }
  if (
    normalized.includes("/v1/responses") &&
    normalized.includes("not found")
  ) {
    return true;
  }

  return false;
}

function normalizeDocMaxChars(docMaxChars?: number): number {
  if (
    typeof docMaxChars !== "number" ||
    !Number.isFinite(docMaxChars) ||
    docMaxChars <= 0
  ) {
    return DEFAULT_DOC_MAX_CHARS;
  }
  return Math.floor(docMaxChars);
}

function buildApiEndpoint(
  baseUrl: string,
  endpoint: "responses" | "chat/completions",
): string {
  const normalized = baseUrl.replace(/\/$/, "");
  if (normalized.endsWith("/v1")) {
    return `${normalized}/${endpoint}`;
  }
  return `${normalized}/v1/${endpoint}`;
}

function trimDecisionDocContent(
  input: DecisionGenerationInput,
  docMaxChars: number,
): DecisionGenerationInput {
  const content = input.decisionDoc.content;
  if (content.length <= docMaxChars) {
    return input;
  }

  return {
    ...input,
    decisionDoc: {
      ...input.decisionDoc,
      content: content.slice(0, docMaxChars),
    },
  };
}

function stripMarkdownCodeFence(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  return match?.[1]?.trim() ?? trimmed;
}

function inferOverallRiskLevel(summary: string): "LOW" | "MEDIUM" | "HIGH" {
  const normalized = summary.toLowerCase();
  if (normalized.includes("高风险") || normalized.includes("high risk")) {
    return "HIGH";
  }
  if (normalized.includes("低风险") || normalized.includes("low risk")) {
    return "LOW";
  }
  return "MEDIUM";
}

function shouldTryPlainTextFallback(message: string): boolean {
  const normalized = message.toLowerCase();
  if (normalized.includes("openai_api_key is not configured")) {
    return false;
  }
  if (
    normalized.includes("openai request failed: 401") ||
    normalized.includes("openai request failed: 403")
  ) {
    return false;
  }
  return true;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export class OpenAIDecisionProvider implements DecisionAIProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly enableWebSearch: boolean;
  private readonly baseUrl: string;
  private readonly systemPrompt: string;
  private readonly docMaxChars: number;

  constructor(options: OpenAIDecisionProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.maxOutputTokens = options.maxOutputTokens;
    this.enableWebSearch = options.enableWebSearch;
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com").replace(
      /\/$/,
      "",
    );
    this.systemPrompt = options.systemPrompt?.trim()
      ? options.systemPrompt.trim()
      : DEFAULT_SYSTEM_PROMPT;
    this.docMaxChars = normalizeDocMaxChars(options.docMaxChars);
  }

  private async requestResponses(inputText: string): Promise<Response> {
    return fetchWithTimeout(
      buildApiEndpoint(this.baseUrl, "responses"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: this.systemPrompt }],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: inputText }],
            },
          ],
          ...(this.enableWebSearch
            ? {
                tools: [{ type: "web_search_preview" }],
              }
            : {}),
          text: {
            format: {
              type: "json_schema",
              name: "daily_decision_output",
              schema: DECISION_OUTPUT_SCHEMA,
              strict: true,
            },
          },
          max_output_tokens: this.maxOutputTokens,
        }),
      },
      this.timeoutMs,
    );
  }

  private async requestChatCompletions(inputText: string): Promise<Response> {
    return fetchWithTimeout(
      buildApiEndpoint(this.baseUrl, "chat/completions"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: this.systemPrompt,
            },
            {
              role: "user",
              content: inputText,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "daily_decision_output",
              schema: DECISION_OUTPUT_SCHEMA,
              strict: true,
            },
          },
          max_tokens: this.maxOutputTokens,
        }),
      },
      this.timeoutMs,
    );
  }

  private async requestPlainTextFallback(
    inputText: string,
  ): Promise<{ text: string; usage: DecisionGenerationResult["usage"] }> {
    const response = await fetchWithTimeout(
      buildApiEndpoint(this.baseUrl, "chat/completions"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: PLAIN_TEXT_FALLBACK_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: inputText,
            },
          ],
          max_tokens: this.maxOutputTokens,
        }),
      },
      this.timeoutMs,
    );

    if (!response.ok) {
      const detail = await response.text();
      throw toOpenAIRequestError(response.status, detail);
    }

    const payload = (await response.json()) as OpenAIChatPayload;
    const text = extractChatOutputText(payload);
    if (!text) {
      throw new Error("openai plain text fallback has no output text");
    }
    return {
      text,
      usage: {
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
        totalTokens: payload.usage?.total_tokens,
      },
    };
  }

  async generateDailyDecision(
    input: DecisionGenerationInput,
  ): Promise<DecisionGenerationResult> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const trimmedInput = trimDecisionDocContent(input, this.docMaxChars);
    const inputText = JSON.stringify(trimmedInput);

    try {
      const response = await this.requestResponses(inputText);

      let outputText: string | undefined;
      let usage: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      } = {};

      if (response.ok) {
        const payload = (await response.json()) as OpenAIResponsePayload;
        outputText = extractOutputText(payload);
        usage = {
          inputTokens: payload.usage?.input_tokens,
          outputTokens: payload.usage?.output_tokens,
          totalTokens: payload.usage?.total_tokens,
        };
      } else {
        const detail = await response.text();
        if (!shouldFallbackToChat(response.status, detail)) {
          throw toOpenAIRequestError(response.status, detail);
        }

        const fallbackResponse = await this.requestChatCompletions(inputText);
        if (!fallbackResponse.ok) {
          const fallbackDetail = await fallbackResponse.text();
          throw toOpenAIRequestError(fallbackResponse.status, fallbackDetail);
        }

        const fallbackPayload =
          (await fallbackResponse.json()) as OpenAIChatPayload;
        outputText = extractChatOutputText(fallbackPayload);
        usage = {
          inputTokens: fallbackPayload.usage?.prompt_tokens,
          outputTokens: fallbackPayload.usage?.completion_tokens,
          totalTokens: fallbackPayload.usage?.total_tokens,
        };
      }

      if (!outputText) {
        throw new Error("openai response has no output text");
      }

      let structured: unknown;
      try {
        structured = JSON.parse(outputText);
      } catch {
        throw new Error("openai output is not valid JSON");
      }

      const validated = validateDecisionGenerationResult(structured);
      return {
        ...validated,
        usage,
        rawResponse: outputText,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "decision generation failed";
      if (!shouldTryPlainTextFallback(message)) {
        throw error;
      }

      const fallback = await this.requestPlainTextFallback(inputText);
      const summary = stripMarkdownCodeFence(fallback.text);
      if (!summary) {
        throw error;
      }

      return {
        summary,
        overallRiskLevel: inferOverallRiskLevel(summary),
        actions: [],
        usage: fallback.usage,
        rawResponse: summary,
      };
    }
  }
}

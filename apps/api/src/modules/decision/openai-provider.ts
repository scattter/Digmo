import OpenAI from "openai";
import {
  DecisionAIProvider,
  DecisionGenerationInput,
  DecisionGenerationResult,
  validateDecisionGenerationResult,
} from "./provider.js";

interface OpenAIDecisionProviderOptions {
  apiKey?: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  baseUrl?: string;
  systemPrompt?: string;
  docMaxChars?: number;
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

const THIRD_PARTY_CHAT_FIRST_MODEL_PREFIXES = [
  "claude-",
  "gemini-",
  "minimax-",
  "deepseek-",
  "qwen-",
  "glm-",
  "kimi-",
  "moonshot-",
  "llama-",
  "doubao-",
  "yi-",
  "hunyuan-",
];

const DEFAULT_DOC_MAX_CHARS = 12_000;
const MAX_COMPAT_CHAT_COMPLETION_TOKENS = 1_024;
const MIN_COMPAT_CHAT_COMPLETION_TIMEOUT_MS = 75_000;
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const MAX_GENERATION_ATTEMPTS = 2;

const DEFAULT_SYSTEM_PROMPT = [
  "你是我的专属投资顾问，根据组合的策略文档，当前持仓，当日涨跌，历史操作要求给出操作建议。",
  "请输出简洁中文纯文本建议，不需要返回思考过程，且内容必须包含以下小节，严格按照顺序返回：",
  "具体操作：只给出具体基金的调仓/加仓/减仓，不需要其他内容。",
  "今日趋势：一句话说明盘面或组合变化方向。",
  "相关建议：结合历史操作与组合策略文档给出具体操作的理由。",
  "风险提示：一句话说明主要风险点与注意事项。",
  "不要输出 Markdown 代码块，要有清晰的换行结构。",
  "不要推荐组合外基金。",
  // "你是一个基金组合交易决策助手。",
  // "你必须严格依据用户组合数据、策略文档和当日上下文给出建议。",
  // "请直接输出中文纯文本建议，不要输出 JSON，不要输出代码块，不要输出标题装饰。",
  // "建议应覆盖当前组合的整体判断、需要注意的风险，以及接下来更适合采取的操作方向。",
  // "不要推荐组合外基金。",
].join("\n");

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

function normalizeCompatMaxTokens(maxOutputTokens: number): number {
  if (!Number.isFinite(maxOutputTokens) || maxOutputTokens <= 0) {
    return Math.min(1600, MAX_COMPAT_CHAT_COMPLETION_TOKENS);
  }

  return Math.min(Math.floor(maxOutputTokens), MAX_COMPAT_CHAT_COMPLETION_TOKENS);
}

function normalizeCompatTimeoutMs(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return MIN_COMPAT_CHAT_COMPLETION_TIMEOUT_MS;
  }

  return Math.max(Math.floor(timeoutMs), MIN_COMPAT_CHAT_COMPLETION_TIMEOUT_MS);
}

function normalizeBaseUrl(baseUrl?: string): string {
  const raw = typeof baseUrl === "string" && baseUrl.trim()
    ? baseUrl.trim()
    : DEFAULT_OPENAI_BASE_URL;
  const firstUrl = raw.match(/https?:\/\/[^\s#]+/iu)?.[0] ?? raw;
  const normalized = firstUrl.replace(/\/$/, "");
  return normalized || DEFAULT_OPENAI_BASE_URL;
}

function buildApiEndpoint(baseUrl: string, endpoint: "chat/completions"): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith("/v1")) {
    return `${normalized}/${endpoint}`;
  }
  return `${normalized}/v1/${endpoint}`;
}

function isOfficialOpenAIBaseUrl(baseUrl: string): boolean {
  const normalized = normalizeBaseUrl(baseUrl);
  return (
    normalized === "https://api.openai.com" ||
    normalized === "https://api.openai.com/v1"
  );
}

function isLikelyOpenAINativeModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith("gpt-") ||
    normalized.startsWith("chatgpt-") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  );
}

function isLikelyThirdPartyCompatModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return THIRD_PARTY_CHAT_FIRST_MODEL_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

function shouldPreferCompatChatCompletions(baseUrl: string, model: string): boolean {
  return (
    !isOfficialOpenAIBaseUrl(baseUrl) &&
    !isLikelyOpenAINativeModel(model) &&
    isLikelyThirdPartyCompatModel(model)
  );
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

function stripReasoningContent(content: string): string {
  const withoutTaggedReasoning = content.replace(
    /<think>[\s\S]*?<\/think>/giu,
    "",
  ).trim();
  if (withoutTaggedReasoning) {
    return withoutTaggedReasoning;
  }

  const closingTag = "</think>";
  const closingIndex = content.lastIndexOf(closingTag);
  if (closingIndex >= 0) {
    const trailingContent = content
      .slice(closingIndex + closingTag.length)
      .trim();
    if (trailingContent) {
      return trailingContent;
    }
  }

  return content.trim();
}

function stripMarkdownDecoration(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s*/u, ""))
    .join("\n")
    .replace(/\*\*(.*?)\*\*/gu, "$1")
    .replace(/__(.*?)__/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .trim();
}

function normalizeModelOutputText(content: string): string {
  return stripMarkdownDecoration(
    stripReasoningContent(stripMarkdownCodeFence(content)),
  );
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

function isRetriableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function parseFailedRequestStatus(message: string): number | undefined {
  const matched = message.match(/^openai request failed: (\d{3})\b/u);
  if (!matched) {
    return undefined;
  }

  const status = Number(matched[1]);
  return Number.isFinite(status) ? status : undefined;
}

function isRetriableGenerationError(error: unknown): boolean {
  if (error instanceof SyntaxError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  if (error.message === "Request timed out.") {
    return true;
  }

  if (error.message === "openai response has no output text") {
    return true;
  }

  const status = parseFailedRequestStatus(error.message);
  if (typeof status === "number") {
    return isRetriableHttpStatus(status);
  }

  return false;
}

export class OpenAIDecisionProvider implements DecisionAIProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly baseUrl: string;
  private readonly systemPrompt: string;
  private readonly docMaxChars: number;
  private readonly preferCompatChatCompletions: boolean;
  private readonly client?: OpenAI;
  private readonly compatMaxOutputTokens: number;
  private readonly compatTimeoutMs: number;

  constructor(options: OpenAIDecisionProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.maxOutputTokens = options.maxOutputTokens;
    this.compatMaxOutputTokens = normalizeCompatMaxTokens(options.maxOutputTokens);
    this.compatTimeoutMs = normalizeCompatTimeoutMs(options.timeoutMs);
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.systemPrompt = options.systemPrompt?.trim()
      ? options.systemPrompt.trim()
      : DEFAULT_SYSTEM_PROMPT;
    this.docMaxChars = normalizeDocMaxChars(options.docMaxChars);
    this.preferCompatChatCompletions = shouldPreferCompatChatCompletions(
      this.baseUrl,
      this.model,
    );

    if (this.apiKey && !this.preferCompatChatCompletions) {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseUrl,
        timeout: this.timeoutMs,
        maxRetries: 0,
      });
    }
  }

  private async requestCompatChatCompletions(inputText: string): Promise<OpenAIChatPayload> {
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
              content: this.systemPrompt,
            },
            {
              role: "user",
              content: inputText,
            },
          ],
          max_tokens: this.compatMaxOutputTokens,
        }),
      },
      this.compatTimeoutMs,
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`openai request failed: ${response.status} ${detail}`);
    }

    return (await response.json()) as OpenAIChatPayload;
  }

  private async requestChatPayload(inputText: string): Promise<OpenAIChatPayload> {
    if (this.preferCompatChatCompletions) {
      return this.requestCompatChatCompletions(inputText);
    }

    return (await this.client?.chat.completions.create({
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
    })) as OpenAIChatPayload;
  }

  async generateDailyDecision(
    input: DecisionGenerationInput,
  ): Promise<DecisionGenerationResult> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const trimmedInput = trimDecisionDocContent(input, this.docMaxChars);
    const inputText = JSON.stringify(trimmedInput);
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const payload = await this.requestChatPayload(inputText);

        if (!payload) {
          throw new Error("openai client is not initialized");
        }

        const outputText = extractChatOutputText(payload);
        if (!outputText) {
          throw new Error("openai response has no output text");
        }

        const normalizedText = normalizeModelOutputText(outputText);
        const validated = validateDecisionGenerationResult(normalizedText);
        return {
          ...validated,
          usage: {
            inputTokens: payload.usage?.prompt_tokens,
            outputTokens: payload.usage?.completion_tokens,
            totalTokens: payload.usage?.total_tokens,
          },
          rawResponse: normalizedText,
        };
      } catch (error) {
        lastError = error;
        if (attempt >= MAX_GENERATION_ATTEMPTS || !isRetriableGenerationError(error)) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("decision generation failed");
  }
}

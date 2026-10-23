import { ERROR_CODES } from "@digmo/shared";
import { AppError } from "../../utils/app-error.js";

export function validateDecisionBaseUrl(raw: string, allowedOrigins?: string[]): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(ERROR_CODES.INVALID_DECISION_AI_CONFIG, "AI 服务地址必须是完整的 HTTP(S) URL", 400);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new AppError(ERROR_CODES.INVALID_DECISION_AI_CONFIG, "AI 服务地址不能包含凭据、查询参数或片段", 400);
  }
  if (allowedOrigins && (url.protocol !== "https:" || !allowedOrigins.includes(url.origin))) {
    throw new AppError(ERROR_CODES.INVALID_DECISION_AI_CONFIG, "该 AI 服务地址未列入白名单，请联系管理员在「AI 服务白名单」中添加", 400);
  }
  return url.toString().replace(/\/$/, "");
}

export function parseDecisionAllowedOrigins(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > 100) {
    throw new AppError(ERROR_CODES.INVALID_DECISION_AI_CONFIG, "白名单必须是地址列表，最多 100 个地址", 400);
  }
  return [...new Set(raw.map((value) => {
    if (typeof value !== "string" || value.length > 500) {
      throw new AppError(ERROR_CODES.INVALID_DECISION_AI_CONFIG, "每个白名单地址必须是长度不超过 500 的字符串", 400);
    }
    const url = new URL(validateDecisionBaseUrl(value.trim()));
    if (url.protocol !== "https:" || url.pathname !== "/") {
      throw new AppError(ERROR_CODES.INVALID_DECISION_AI_CONFIG, "白名单地址必须使用 HTTPS，且不能包含 /v1 等路径", 400);
    }
    return url.origin;
  }))];
}

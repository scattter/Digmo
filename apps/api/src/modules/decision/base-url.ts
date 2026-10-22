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
    throw new AppError(ERROR_CODES.INVALID_DECISION_AI_CONFIG, "该 AI 服务地址未列入服务器 DECISION_AI_ALLOWED_ORIGINS 白名单", 400);
  }
  return url.toString().replace(/\/$/, "");
}

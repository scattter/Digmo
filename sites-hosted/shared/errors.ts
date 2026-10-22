import { ERROR_CODES } from "./constants.js";

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorResponse {
  code: ErrorCode;
  message: string;
  requestId?: string;
  details?: unknown;
}

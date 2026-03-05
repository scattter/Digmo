import { ErrorCode } from "@digmo/shared";

export class AppError extends Error {
  readonly code: ErrorCode;

  readonly statusCode: number;

  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

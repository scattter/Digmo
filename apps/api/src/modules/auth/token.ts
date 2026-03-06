import { createHmac, timingSafeEqual } from "node:crypto";

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: "admin" | "user";
  iat: number;
  exp: number;
}

export class TokenError extends Error {
  readonly reason: "invalid" | "expired";

  constructor(reason: "invalid" | "expired", message: string) {
    super(message);
    this.reason = reason;
  }
}

function encodeBase64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function decodeBase64Url(input: string): Buffer {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (base64.length % 4)) % 4;
  return Buffer.from(base64 + "=".repeat(padding), "base64");
}

function signPart(content: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(content).digest();
  return encodeBase64Url(digest);
}

export function signAccessToken(
  payload: Pick<AccessTokenPayload, "sub" | "username" | "role">,
  secret: string,
  expiresInSec: number
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AccessTokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSec
  };

  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const headerPart = encodeBase64Url(JSON.stringify(header));
  const payloadPart = encodeBase64Url(JSON.stringify(fullPayload));
  const unsigned = `${headerPart}.${payloadPart}`;
  const signature = signPart(unsigned, secret);
  return `${unsigned}.${signature}`;
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new TokenError("invalid", "invalid token format");
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const unsigned = `${headerPart}.${payloadPart}`;
  const expectedSignature = signPart(unsigned, secret);

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signaturePart);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new TokenError("invalid", "invalid token signature");
  }

  let payload: AccessTokenPayload;
  try {
    payload = JSON.parse(decodeBase64Url(payloadPart).toString("utf-8")) as AccessTokenPayload;
  } catch {
    throw new TokenError("invalid", "invalid token payload");
  }

  if (!payload?.sub || !payload?.username || (payload?.role !== "admin" && payload?.role !== "user")) {
    throw new TokenError("invalid", "invalid token claims");
  }

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= now) {
    throw new TokenError("expired", "token expired");
  }

  return payload;
}

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_PREFIX = "scrypt";
const KEY_LEN = 64;

function toBuffer(hex: string): Buffer | undefined {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    return undefined;
  }
  return Buffer.from(hex, "hex");
}

export function hashPassword(password: string): string {
  const normalized = password.trim();
  if (!normalized) {
    throw new Error("password is required");
  }

  const salt = randomBytes(16);
  const derived = scryptSync(normalized, salt, KEY_LEN);
  return `${HASH_PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const normalized = password.trim();
  if (!normalized) {
    return false;
  }

  const parts = hash.split("$");
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) {
    return false;
  }

  const salt = toBuffer(parts[1]);
  const expected = toBuffer(parts[2]);
  if (!salt || !expected) {
    return false;
  }

  const actual = scryptSync(normalized, salt, expected.length);
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

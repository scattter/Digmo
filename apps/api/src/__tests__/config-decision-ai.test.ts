import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getConfig } from "../config.js";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CORS_ORIGINS", "");
  vi.stubEnv("OPENAI_MAX_TOKENS", undefined);
  vi.stubEnv("OPENAI_TIMEOUT_MS", undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe("decision AI budget", () => {
  test("defaults to a budget that leaves room for reasoning and output", () => {
    expect(getConfig().decisionAi).toMatchObject({
      openaiMaxTokens: 16384,
      openaiTimeoutMs: 120000,
    });
  });

  test("respects explicit environment overrides", () => {
    vi.stubEnv("OPENAI_MAX_TOKENS", "32768");
    vi.stubEnv("OPENAI_TIMEOUT_MS", "180000");
    expect(getConfig().decisionAi).toMatchObject({
      openaiMaxTokens: 32768,
      openaiTimeoutMs: 180000,
    });
  });

  test.each(["", "invalid", "0", "-1"])("falls back to defaults for invalid values %j", (value) => {
    vi.stubEnv("OPENAI_MAX_TOKENS", value);
    vi.stubEnv("OPENAI_TIMEOUT_MS", value);
    expect(getConfig().decisionAi).toMatchObject({
      openaiMaxTokens: 16384,
      openaiTimeoutMs: 120000,
    });
  });
});

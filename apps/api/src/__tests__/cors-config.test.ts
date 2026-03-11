import { describe, expect, test } from "vitest";
import { CORS_METHODS } from "../app.js";

describe("CORS config", () => {
  test("allows PUT for decision doc save preflight", () => {
    expect(CORS_METHODS).toContain("PUT");
  });
});

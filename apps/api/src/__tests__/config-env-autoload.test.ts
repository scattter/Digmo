import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadEnvFromDotEnvIfPresent } from "../config.js";

const tempRoots: string[] = [];
const KEY_NAME = "DIGMO_ENV_AUTOLOAD_TEST_KEY";

afterEach(() => {
  delete process.env[KEY_NAME];
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

function makeDotEnv(content: string): string {
  const root = mkdtempSync(join(tmpdir(), "digmo-env-test-"));
  tempRoots.push(root);
  const filePath = join(root, ".env");
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("loadEnvFromDotEnvIfPresent", () => {
  test("loads variables from .env file", () => {
    const filePath = makeDotEnv(`${KEY_NAME}=from_file\n`);

    delete process.env[KEY_NAME];
    loadEnvFromDotEnvIfPresent(filePath);

    expect(process.env[KEY_NAME]).toBe("from_file");
  });

  test("does not override existing process.env variables", () => {
    const filePath = makeDotEnv(`${KEY_NAME}=from_file\n`);

    process.env[KEY_NAME] = "from_shell";
    loadEnvFromDotEnvIfPresent(filePath);

    expect(process.env[KEY_NAME]).toBe("from_shell");
  });
});

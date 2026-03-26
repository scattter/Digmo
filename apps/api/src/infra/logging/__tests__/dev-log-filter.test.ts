import { describe, expect, test } from "vitest";
import {
  createDevLogFilterState,
  shouldDropDevLogEntry,
} from "../dev-log-filter.js";

describe("dev log filter", () => {
  test("keeps the first fastify listen log", () => {
    const state = createDevLogFilterState();

    expect(
      shouldDropDevLogEntry(
        {
          level: 30,
          msg: "Server listening at http://127.0.0.1:3001",
        },
        state,
      ),
    ).toBe(false);
  });

  test("drops duplicate fastify listen logs after the first one", () => {
    const state = createDevLogFilterState();

    expect(
      shouldDropDevLogEntry(
        {
          level: 30,
          msg: "Server listening at http://127.0.0.1:3001",
        },
        state,
      ),
    ).toBe(false);

    expect(
      shouldDropDevLogEntry(
        {
          level: 30,
          msg: "Server listening at http://10.0.0.8:3001",
        },
        state,
      ),
    ).toBe(true);
  });

  test("keeps non-listen logs unchanged", () => {
    const state = createDevLogFilterState();

    expect(
      shouldDropDevLogEntry(
        {
          level: 50,
          msg: "failed to start digmo api",
          err: {
            message: "listen EADDRINUSE",
          },
        },
        state,
      ),
    ).toBe(false);

    expect(
      shouldDropDevLogEntry(
        {
          level: 30,
          msg: "digmo api started",
          port: 3001,
        },
        state,
      ),
    ).toBe(false);
  });
});

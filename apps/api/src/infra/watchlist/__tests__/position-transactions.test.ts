import { ERROR_CODES } from "@digmo/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SqliteWatchlistStore } from "../sqlite-watchlist-store.js";

const operationIds = vi.hoisted(() => [] as string[]);

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomUUID: () => operationIds.shift() ?? actual.randomUUID()
  };
});

const CREATED_AT = new Date("2026-03-23T07:20:00.000Z");
const SETTLED_AT = new Date("2026-03-24T01:00:01.000Z");
const INVALID_PORTFOLIO = { code: ERROR_CODES.INVALID_PORTFOLIO, statusCode: 400 };

async function createPortfolio(totalAsset = 0) {
  const store = new SqliteWatchlistStore(":memory:", {
    bootstrapAdminUsername: "test",
    bootstrapAdminPassword: "test-password"
  });
  const user = await store.getUserByUsername("test");
  const userId = user!.id;
  const portfolio = await store.createPortfolio(userId, "测试组合", "FREE", totalAsset);
  const fund = { portfolioId: portfolio.id, fundCode: "000001" };
  await store.upsertPortfolioFund(userId, { ...fund, holdingAmount: 1000, holdingProfitAmount: 100 });
  return { store, userId, fund };
}

describe("portfolio position transactions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(CREATED_AT);
  });

  afterEach(() => {
    operationIds.length = 0;
    vi.useRealTimers();
  });

  test.each([false, true])("same-millisecond operations keep insertion order when recomputed=%s", async (recompute) => {
    const { store, userId, fund } = await createPortfolio();
    operationIds.push("ffffffff-ffff-4fff-8fff-ffffffffffff", "00000000-0000-4000-8000-000000000000");
    const first = await store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 100 });
    const second = await store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 200 });
    expect(first!.createdAt).toBe(second!.createdAt);
    expect(second!.id < first!.id).toBe(true);

    if (recompute) {
      await store.updatePortfolioFund(userId, { ...fund, holdingProfitAmount: 200 });
    }
    const operations = await store.listPositionOperations(userId, fund.portfolioId);
    expect(operations).toHaveLength(2);
    expect(operations.find((operation) => operation.id === first!.id)).toMatchObject({
      beforeHoldingAmount: 1000,
      afterHoldingAmount: 1100
    });
    expect(operations.find((operation) => operation.id === second!.id)).toMatchObject({
      beforeHoldingAmount: 1100,
      afterHoldingAmount: 1300
    });

    vi.setSystemTime(SETTLED_AT);
    expect(await store.listPortfolioFunds(userId, fund.portfolioId)).toEqual([
      expect.objectContaining({ holdingAmount: 1300, holdingProfitAmount: recompute ? 200 : 100 })
    ]);
  });

  test.each(["upsert", "patch"] as const)("%s recomputes pending operations from edited holdings", async (method) => {
    const { store, userId, fund } = await createPortfolio();
    await store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 100 });
    const update = { ...fund, holdingAmount: 2000, holdingProfitAmount: 200 };
    if (method === "upsert") {
      await store.upsertPortfolioFund(userId, update);
    } else {
      await store.updatePortfolioFund(userId, update);
    }

    expect(await store.getPortfolioFund(userId, fund.portfolioId, fund.fundCode)).toMatchObject({
      holdingAmount: 2000,
      holdingProfitAmount: 200
    });
    expect(await store.listPositionOperations(userId, fund.portfolioId)).toEqual([
      expect.objectContaining({ beforeHoldingAmount: 2000, afterHoldingAmount: 2100, status: "PENDING" })
    ]);

    vi.setSystemTime(SETTLED_AT);
    await store.listPortfolioFunds(userId, fund.portfolioId);
    expect(await store.getPortfolioFund(userId, fund.portfolioId, fund.fundCode)).toMatchObject({
      holdingAmount: 2100,
      holdingProfitAmount: 200
    });
  });

  test.each(["upsert", "patch"] as const)("%s rolls back holdings and pending snapshots when assets are exceeded", async (method) => {
    const { store, userId, fund } = await createPortfolio(1500);
    await store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 500 });
    const beforeFund = await store.getPortfolioFund(userId, fund.portfolioId, fund.fundCode);
    const beforeOperations = await store.listPositionOperations(userId, fund.portfolioId);
    const update = { ...fund, holdingAmount: 1500, holdingProfitAmount: 200 };

    await expect(
      method === "upsert" ? store.upsertPortfolioFund(userId, update) : store.updatePortfolioFund(userId, update)
    ).rejects.toMatchObject(INVALID_PORTFOLIO);
    expect(await store.getPortfolioFund(userId, fund.portfolioId, fund.fundCode)).toEqual(beforeFund);
    expect(await store.listPositionOperations(userId, fund.portfolioId)).toEqual(beforeOperations);
  });

  test.each(["upsert", "patch"] as const)("%s rolls back an edit that invalidates a pending decrease", async (method) => {
    const { store, userId, fund } = await createPortfolio();
    await store.applyPositionOperation(userId, { ...fund, operationType: "DECREASE", amount: 600 });
    const beforeOperations = await store.listPositionOperations(userId, fund.portfolioId);
    const update = { ...fund, holdingAmount: 500, holdingProfitAmount: 50 };

    await expect(
      method === "upsert" ? store.upsertPortfolioFund(userId, update) : store.updatePortfolioFund(userId, update)
    ).rejects.toMatchObject(INVALID_PORTFOLIO);
    expect(await store.getPortfolioFund(userId, fund.portfolioId, fund.fundCode)).toMatchObject({
      holdingAmount: 1000,
      holdingProfitAmount: 100
    });
    expect(await store.listPositionOperations(userId, fund.portfolioId)).toEqual(beforeOperations);
  });

  test("new and edited funds account for pending operations on other funds", async () => {
    const { store, userId, fund } = await createPortfolio(1500);
    const otherFund = { portfolioId: fund.portfolioId, fundCode: "000002" };
    await store.upsertPortfolioFund(userId, { ...otherFund, holdingAmount: 250 });
    await store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 250 });

    await expect(store.updatePortfolioFund(userId, { ...otherFund, holdingAmount: 250.01 })).rejects.toMatchObject(
      INVALID_PORTFOLIO
    );
    await expect(
      store.upsertPortfolioFund(userId, { portfolioId: fund.portfolioId, fundCode: "000003", holdingAmount: 0.01 })
    ).rejects.toMatchObject(INVALID_PORTFOLIO);
    expect(await store.getPortfolioFund(userId, fund.portfolioId, otherFund.fundCode)).toMatchObject({ holdingAmount: 250 });
    expect(await store.getPortfolioFund(userId, fund.portfolioId, "000003")).toBeUndefined();
    expect((await store.listFundStatesByCodes(userId, ["000003"])).size).toBe(0);
  });

  test("canceling a pending decrease cannot make the remaining increase exceed assets", async () => {
    const { store, userId, fund } = await createPortfolio(1000);
    const decrease = await store.applyPositionOperation(userId, { ...fund, operationType: "DECREASE", amount: 500 });
    vi.advanceTimersByTime(1);
    await store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 500 });
    const beforeOperations = await store.listPositionOperations(userId, fund.portfolioId);

    await expect(
      store.deletePositionOperation(userId, fund.portfolioId, fund.fundCode, decrease!.id)
    ).rejects.toMatchObject(INVALID_PORTFOLIO);
    expect(await store.listPositionOperations(userId, fund.portfolioId)).toEqual(beforeOperations);
    vi.setSystemTime(SETTLED_AT);
    await store.listPortfolioFunds(userId, fund.portfolioId);
    expect(await store.getPortfolioFund(userId, fund.portfolioId, fund.fundCode)).toMatchObject({
      holdingAmount: 1000,
      holdingProfitAmount: 50
    });
  });

  test("a total asset edit covers both settled and projected holdings and rolls back the whole edit", async () => {
    const { store, userId, fund } = await createPortfolio(1500);
    const increase = await store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 500 });
    await expect(store.updatePortfolio(userId, fund.portfolioId, { name: "不能保存", totalAsset: 1499.99 })).rejects.toMatchObject(
      INVALID_PORTFOLIO
    );
    expect(await store.getPortfolio(userId, fund.portfolioId)).toMatchObject({ name: "测试组合", totalAsset: 1500 });

    await store.deletePositionOperation(userId, fund.portfolioId, fund.fundCode, increase!.id);
    vi.advanceTimersByTime(1);
    await store.applyPositionOperation(userId, { ...fund, operationType: "DECREASE", amount: 500 });
    await expect(store.updatePortfolio(userId, fund.portfolioId, { totalAsset: 999.99 })).rejects.toMatchObject(INVALID_PORTFOLIO);
    await expect(store.updatePortfolio(userId, fund.portfolioId, { totalAsset: 1000 })).resolves.toBe(true);
    await expect(store.updatePortfolio(userId, fund.portfolioId, { totalAsset: 0 })).resolves.toBe(true);
    vi.advanceTimersByTime(1);
    await expect(store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 2000 })).resolves.toMatchObject({
      afterHoldingAmount: 2500
    });
  });

  test("all 201 pending operations count while the history endpoint stays capped at 200", async () => {
    const { store, userId, fund } = await createPortfolio(1201);
    for (let index = 0; index < 201; index += 1) {
      vi.advanceTimersByTime(1);
      await store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 1 });
    }

    expect(await store.listPositionOperations(userId, fund.portfolioId, { limit: 1000 })).toHaveLength(200);
    await expect(store.updatePortfolio(userId, fund.portfolioId, { totalAsset: 1200 })).rejects.toMatchObject(INVALID_PORTFOLIO);
    vi.advanceTimersByTime(1);
    await expect(store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 0.01 })).rejects.toMatchObject(
      INVALID_PORTFOLIO
    );
    vi.setSystemTime(SETTLED_AT);
    await store.listPortfolioFunds(userId, fund.portfolioId);
    expect(await store.getPortfolioFund(userId, fund.portfolioId, fund.fundCode)).toMatchObject({ holdingAmount: 1201 });
  });

  test("competing increases cannot both consume the same remaining cash", async () => {
    const { store, userId, fund } = await createPortfolio(1150);
    const results = await Promise.allSettled([
      store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 100 }),
      store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 100 })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: INVALID_PORTFOLIO });
    expect(await store.listPositionOperations(userId, fund.portfolioId)).toHaveLength(1);
    vi.setSystemTime(SETTLED_AT);
    await store.listPortfolioFunds(userId, fund.portfolioId);
    expect(await store.getPortfolioFund(userId, fund.portfolioId, fund.fundCode)).toMatchObject({ holdingAmount: 1100 });
  });

  test("a rejected mutation also rolls back due settlements from the same transaction", async () => {
    const { store, userId, fund } = await createPortfolio(1500);
    await store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 500 });
    vi.setSystemTime(SETTLED_AT);
    expect(await store.getPortfolioFund(userId, fund.portfolioId, fund.fundCode)).toMatchObject({ holdingAmount: 1000 });

    await expect(store.applyPositionOperation(userId, { ...fund, operationType: "INCREASE", amount: 100 })).rejects.toMatchObject(
      INVALID_PORTFOLIO
    );
    expect(await store.getPortfolioFund(userId, fund.portfolioId, fund.fundCode)).toMatchObject({ holdingAmount: 1000 });
    vi.setSystemTime(CREATED_AT);
    expect(await store.getPortfolioFund(userId, fund.portfolioId, fund.fundCode)).toMatchObject({ holdingAmount: 1000 });
    expect(await store.listPositionOperations(userId, fund.portfolioId)).toEqual([
      expect.objectContaining({ status: "PENDING", afterHoldingAmount: 1500 })
    ]);
    vi.setSystemTime(SETTLED_AT);
    await store.listPortfolioFunds(userId, fund.portfolioId);
    expect(await store.getPortfolioFund(userId, fund.portfolioId, fund.fundCode)).toMatchObject({ holdingAmount: 1500 });
  });
});

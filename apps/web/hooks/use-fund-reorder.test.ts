import { useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioFundItem } from "@digmo/shared";
import { useFundReorder } from "./use-fund-reorder";

const reorderPortfolioFunds = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ reorderPortfolioFunds }));
function funds(id: string) {
  return ["1", "2"].map((fundCode, displayOrder) => ({
    portfolioId: id, fundCode, displayOrder
  } as PortfolioFundItem));
}
function deferred() {
  let reject!: (error: Error) => void;
  let resolve!: () => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const error = vi.fn();
const status = vi.fn();
function useReorder(portfolioId: string) {
  const [items, setItems] = useState(() => funds(portfolioId));
  const [busy, setBusy] = useState(false);
  const reorder = useFundReorder({ selectedPortfolioId: portfolioId, portfolioFunds: items,
    setPortfolioFunds: setItems, setIsReordering: setBusy, setErrorText: error, setStatusText: status });
  return { items, setItems, busy, reorder };
}

afterEach(cleanup);

describe("useFundReorder", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("persists the new order and blocks a second move before React rerenders", async () => {
    const pending = deferred();
    reorderPortfolioFunds.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useReorder("A"));
    act(() => {
      result.current.reorder.movePortfolioFundByStep("1", 1, false);
      result.current.reorder.movePortfolioFundByStep("1", 1, false);
    });
    expect(result.current.items.map((item) => item.fundCode)).toEqual(["2", "1"]);
    expect(reorderPortfolioFunds).toHaveBeenCalledExactlyOnceWith("A", ["2", "1"]);
    await act(async () => { pending.resolve(); });
    expect(result.current.busy).toBe(false);
    expect(status).toHaveBeenLastCalledWith("已更新组合基金顺序。");
  });

  it("restores the original order when the same optimistic update fails", async () => {
    const pending = deferred();
    reorderPortfolioFunds.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useReorder("A"));
    act(() => result.current.reorder.movePortfolioFundByStep("1", 1, false));
    await act(async () => { pending.reject(new Error("保存失败")); });
    expect(result.current.items.map((item) => item.fundCode)).toEqual(["1", "2"]);
    expect(error).toHaveBeenLastCalledWith("保存失败");
  });

  it("does not roll back data belonging to another portfolio", async () => {
    const pending = deferred();
    reorderPortfolioFunds.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(({ id }) => useReorder(id), { initialProps: { id: "A" } });
    act(() => result.current.reorder.movePortfolioFundByStep("1", 1, false));
    rerender({ id: "B" });
    act(() => result.current.setItems(funds("B")));
    error.mockClear();
    await act(async () => { pending.reject(new Error("A 保存失败")); });
    expect(result.current.items.every((item) => item.portfolioId === "B")).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it("does not replace a newer refresh of the same portfolio with an old snapshot", async () => {
    const pending = deferred();
    reorderPortfolioFunds.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useReorder("A"));
    act(() => result.current.reorder.movePortfolioFundByStep("1", 1, false));
    const refreshed = funds("A").map((item) => ({ ...item, holdingAmount: 500 }));
    act(() => result.current.setItems(refreshed));
    await act(async () => { pending.reject(new Error("保存失败")); });
    expect(result.current.items).toBe(refreshed);
  });
});

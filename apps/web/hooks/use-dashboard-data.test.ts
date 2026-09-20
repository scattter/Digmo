import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioFundItem } from "@digmo/shared";
import { useDashboardData } from "./use-dashboard-data";

const api = vi.hoisted(() => ({
  fetchPortfolios: vi.fn(),
  fetchFlatFunds: vi.fn(),
  fetchPortfolioFunds: vi.fn()
}));
vi.mock("@/lib/api", () => api);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function detail(id: string) {
  return {
    portfolio: { id, name: id, type: "FREE" as const },
    funds: [{ portfolioId: id, fundCode: id, displayOrder: 0, holdingAmount: 100,
      holdingProfitAmount: 5, estimateChangePct: 0.02 } as PortfolioFundItem]
  };
}

afterEach(cleanup);

describe("useDashboardData request isolation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.fetchPortfolios.mockResolvedValue([]);
    api.fetchFlatFunds.mockResolvedValue([]);
    api.fetchPortfolioFunds.mockImplementation((id: string) => Promise.resolve(detail(id)));
  });

  it("waits for authentication and loads details only for the active portfolio", async () => {
    const { result, rerender } = renderHook((props) => useDashboardData(props), {
      initialProps: { enabled: false, selectedPortfolioId: "all" }
    });
    expect(api.fetchPortfolios).not.toHaveBeenCalled();
    expect(api.fetchFlatFunds).not.toHaveBeenCalled();
    rerender({ enabled: true, selectedPortfolioId: "all" });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(api.fetchPortfolioFunds).not.toHaveBeenCalled();
    rerender({ enabled: true, selectedPortfolioId: "A" });
    await waitFor(() => expect(result.current.portfolioFunds[0]?.fundCode).toBe("A"));
    rerender({ enabled: true, selectedPortfolioId: "B" });
    await waitFor(() => expect(result.current.portfolioFunds[0]?.fundCode).toBe("B"));
    expect(api.fetchPortfolios).toHaveBeenCalledTimes(1);
    expect(api.fetchFlatFunds).toHaveBeenCalledTimes(1);
    expect(result.current.estimateAnalysisRows[0].estimateChangePct).toBeUndefined();
    expect(result.current.estimateAnalysisRows[0].intradayAmount).toBeUndefined();
  });

  it("clears the old portfolio immediately and ignores its late data and loading completion", async () => {
    const a = deferred<ReturnType<typeof detail>>();
    const b = deferred<ReturnType<typeof detail>>();
    api.fetchPortfolioFunds.mockImplementation((id: string) => id === "A" ? a.promise : b.promise);
    const { result, rerender } = renderHook((props) => useDashboardData(props), {
      initialProps: { enabled: true, selectedPortfolioId: "A" }
    });
    const signalA = api.fetchPortfolioFunds.mock.calls[0][1] as AbortSignal;
    rerender({ enabled: true, selectedPortfolioId: "B" });
    expect(signalA.aborted).toBe(true);
    expect(result.current.portfolioFunds).toEqual([]);
    await act(async () => { a.resolve(detail("A")); });
    expect(result.current.portfolioFunds).toEqual([]);
    expect(result.current.editStateMap.size).toBe(0);
    expect(result.current.isLoadingPortfolioFunds).toBe(true);
    await act(async () => { b.resolve(detail("B")); });
    expect(result.current.portfolioFunds[0].portfolioId).toBe("B");
    expect(result.current.editStateMap.has("B")).toBe(true);
    expect(result.current.isLoadingPortfolioFunds).toBe(false);
  });

  it("ignores an old failure even after returning to the same portfolio", async () => {
    const first = deferred<ReturnType<typeof detail>>();
    api.fetchPortfolioFunds.mockImplementationOnce(() => first.promise);
    const { result, rerender, unmount } = renderHook((props) => useDashboardData(props), {
      initialProps: { enabled: true, selectedPortfolioId: "A" }
    });
    rerender({ enabled: true, selectedPortfolioId: "B" });
    await waitFor(() => expect(result.current.portfolioFunds[0]?.portfolioId).toBe("B"));
    rerender({ enabled: true, selectedPortfolioId: "A" });
    await waitFor(() => expect(result.current.portfolioFunds[0]?.portfolioId).toBe("A"));
    await act(async () => { first.reject(new Error("old request failed")); });
    expect(result.current.errorText).toBe("");
    const latestSignal = api.fetchPortfolioFunds.mock.calls.at(-1)?.[1] as AbortSignal;
    unmount();
    expect(latestSignal.aborted).toBe(true);
  });

  it("accepts only the latest flat-fund query when sorting changes", async () => {
    const first = deferred<never[]>();
    api.fetchFlatFunds.mockImplementationOnce(() => first.promise);
    const { result } = renderHook(() => useDashboardData({ enabled: true, selectedPortfolioId: "all" }));
    act(() => result.current.setFlatSortOrder("desc"));
    await waitFor(() => expect(result.current.isLoadingFlatFunds).toBe(false));
    await act(async () => { first.reject(new Error("outdated sort failed")); });
    expect(result.current.errorText).toBe("");
    expect(api.fetchFlatFunds.mock.calls[0][2].aborted).toBe(true);
  });

  it("honors explicit refresh targets without clearing or loading an unrelated active portfolio", async () => {
    const { result } = renderHook(() => useDashboardData({ enabled: true, selectedPortfolioId: "A" }));
    await waitFor(() => expect(result.current.portfolioFunds[0]?.portfolioId).toBe("A"));
    const previous = result.current.portfolioFunds;
    api.fetchPortfolioFunds.mockClear();
    await act(async () => { await result.current.refreshData({ selectedPortfolioId: "B" }); });
    await act(async () => { await result.current.refreshData({ selectedPortfolioId: "all" }); });
    expect(api.fetchPortfolioFunds).not.toHaveBeenCalled();
    expect(result.current.portfolioFunds).toBe(previous);
    await act(async () => { await result.current.refreshData({ selectedPortfolioId: "A" }); });
    expect(api.fetchPortfolioFunds).toHaveBeenCalledExactlyOnceWith("A", expect.any(AbortSignal));
  });

  it("keeps the last good portfolio data when a refresh fails", async () => {
    const { result } = renderHook(() => useDashboardData({ enabled: true, selectedPortfolioId: "A" }));
    await waitFor(() => expect(result.current.portfolioFunds[0]?.portfolioId).toBe("A"));
    const previous = result.current.portfolioFunds;
    api.fetchPortfolioFunds.mockRejectedValueOnce(new Error("更新失败"));
    await act(async () => { await result.current.refreshData().catch(() => {}); });
    expect(result.current.portfolioFunds).toBe(previous);
    expect(result.current.errorText).toContain("更新失败");
    expect(result.current.isLoadingPortfolioFunds).toBe(false);
  });

  it("waits for every refresh request and preserves independent errors", async () => {
    const { result } = renderHook(() => useDashboardData({ enabled: true, selectedPortfolioId: "all" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const flat = deferred<never[]>();
    api.fetchPortfolios.mockRejectedValueOnce(new Error("列表不可用"));
    api.fetchFlatFunds.mockReturnValueOnce(flat.promise);
    let settled = false;
    let refresh!: Promise<unknown>;
    act(() => {
      refresh = result.current.refreshData().catch((error) => error).finally(() => { settled = true; });
    });
    await waitFor(() => expect(result.current.errorText).toContain("列表不可用"));
    expect(settled).toBe(false);
    expect(result.current.isLoadingFlatFunds).toBe(true);
    await act(async () => { flat.resolve([]); await refresh; });
    expect(settled).toBe(true);
    expect(result.current.isLoading).toBe(false);
    act(() => result.current.setFlatExpand("expanded"));
    await waitFor(() => expect(result.current.isLoadingFlatFunds).toBe(false));
    expect(result.current.errorText).toContain("列表不可用");
    await act(async () => { await result.current.refreshData(); });
    expect(result.current.errorText).toBe("");
  });
});

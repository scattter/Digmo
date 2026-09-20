"use client";

import {
  FlatFundItem,
  PortfolioFundItem,
  PortfolioSummary,
  PortfolioType
} from "@digmo/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchFlatFunds,
  fetchPortfolioFunds,
  fetchPortfolios,
  FlatExpandMode,
  SortOrder
} from "@/lib/api";
import { FundEditState, formatBeijingTime } from "@/lib/format";

export type MainView = "funds" | "portfolios" | "overview" | "analysis";
export type LandingSection = "overview" | "portfolios" | "funds";
export interface RefreshDataOptions {
  silent?: boolean;
  selectedPortfolioId?: string;
}

export interface PortfolioMeta {
  id: string;
  name: string;
  type: PortfolioType;
}

export function nextSortOrder(current: SortOrder): SortOrder {
  if (current === "default") {
    return "desc";
  }
  if (current === "desc") {
    return "asc";
  }
  return "default";
}

export function getFlatSortButtonLabel(order: SortOrder): string {
  if (order === "desc") {
    return "涨幅排序 ↓";
  }
  if (order === "asc") {
    return "涨幅排序 ↑";
  }
  return "涨幅排序";
}

export function getEstimateSortButtonLabel(order: SortOrder): string {
  if (order === "desc") {
    return "今日预估排序 ↓";
  }
  if (order === "asc") {
    return "今日预估排序 ↑";
  }
  return "今日预估排序";
}

export function useDashboardData({ enabled, selectedPortfolioId }: { enabled: boolean; selectedPortfolioId: string }) {
  const [mainView, setMainView] = useState<MainView>("overview");
  const [flatExpand, setFlatExpand] = useState<FlatExpandMode>("dedup");
  const [flatSortOrder, setFlatSortOrder] = useState<SortOrder>("default");
  const [estimateSortOrder, setEstimateSortOrder] = useState<SortOrder>("default");

  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([]);
  const [flatFunds, setFlatFunds] = useState<FlatFundItem[]>([]);
  const [storedPortfolioFunds, setPortfolioFunds] = useState<PortfolioFundItem[]>([]);
  const [selectedPortfolioMeta, setSelectedPortfolioMeta] = useState<PortfolioMeta | null>(null);

  const [storedEditStateMap, setEditStateMap] = useState<Map<string, FundEditState>>(new Map());

  const [isLoadingPortfolios, setIsLoadingPortfolios] = useState(true);
  const [isLoadingFlatFunds, setIsLoadingFlatFunds] = useState(true);
  const [isLoadingPortfolioFunds, setIsLoadingPortfolioFunds] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [loadErrors, setLoadErrors] = useState({ portfolios: "", flatFunds: "", portfolioFunds: "" });
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState("");

  const selectionMatches = selectedPortfolioMeta?.id === selectedPortfolioId;
  const portfolioFunds = selectionMatches ? storedPortfolioFunds : [];
  const editStateMap = selectionMatches ? storedEditStateMap : new Map<string, FundEditState>();
  const errorText = Object.values(loadErrors).filter(Boolean).join("；");

  const isLoading =
    isLoadingPortfolios || isLoadingFlatFunds || isLoadingPortfolioFunds || isActionLoading;
  const setIsLoading = setIsActionLoading;
  const isBusy = isLoading || isReordering;

  const selectedPortfolioSummary = useMemo(
    () => portfolios.find((item) => item.id === selectedPortfolioId),
    [portfolios, selectedPortfolioId]
  );

  const ratioAnalysisRows = useMemo(() => {
    if (selectedPortfolioMeta?.type !== "RATIO") {
      return [];
    }

    return portfolioFunds
      .map((item) => {
        if (typeof item.plannedRatio !== "number" || typeof item.actualRatio !== "number") {
          return undefined;
        }
        const overPlannedRatio = item.actualRatio - item.plannedRatio;
        return {
          fundCode: item.fundCode,
          fundName: item.fundName ?? `基金 ${item.fundCode}`,
          plannedRatio: item.plannedRatio,
          actualRatio: item.actualRatio,
          overByMoreThan15Pct: overPlannedRatio > 0.15
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [portfolioFunds, selectedPortfolioMeta?.type]);

  const estimateAnalysisRows = useMemo(() => {
    const rows = portfolioFunds.map((item, index) => {
      const estimateChangePct =
        typeof item.dailyProfitPct === "number" ? item.dailyProfitPct : undefined;
      const intradayAmount =
        typeof item.intradayAmount === "number"
          ? item.intradayAmount
          : undefined;

      return {
        order: index,
        fundCode: item.fundCode,
        fundName: item.fundName ?? `基金 ${item.fundCode}`,
        estimateChangePct,
        intradayAmount
      };
    });

    if (estimateSortOrder === "default") {
      return rows;
    }

    return rows.slice().sort((a, b) => {
      const aMissing = typeof a.estimateChangePct !== "number";
      const bMissing = typeof b.estimateChangePct !== "number";

      if (aMissing && !bMissing) {
        return 1;
      }
      if (!aMissing && bMissing) {
        return -1;
      }
      if (aMissing && bMissing) {
        return a.order - b.order;
      }

      const diff =
        estimateSortOrder === "asc"
          ? (a.estimateChangePct as number) - (b.estimateChangePct as number)
          : (b.estimateChangePct as number) - (a.estimateChangePct as number);
      if (Math.abs(diff) > 0.0000001) {
        return diff;
      }
      return a.order - b.order;
    });
  }, [portfolioFunds, estimateSortOrder]);

  type Resource = keyof typeof loadErrors;
  const requests = useRef<Record<Resource, { sequence: number; controller?: AbortController }>>({
    portfolios: { sequence: 0 },
    flatFunds: { sequence: 0 },
    portfolioFunds: { sequence: 0 }
  });
  const current = useRef({ enabled, selectedPortfolioId, flatExpand, flatSortOrder });
  current.current = { enabled, selectedPortfolioId, flatExpand, flatSortOrder };

  const cancelRequest = useCallback((resource: Resource) => {
    const request = requests.current[resource];
    request.sequence += 1;
    request.controller?.abort();
  }, []);

  const runRequest = useCallback(async <T,>(
    resource: Resource,
    read: (signal: AbortSignal) => Promise<T>,
    apply: (data: T) => void,
    silent: boolean,
    matches: () => boolean = () => true
  ) => {
    if (!current.current.enabled || !matches()) return;
    cancelRequest(resource);
    const request = requests.current[resource];
    const sequence = request.sequence;
    const controller = new AbortController();
    request.controller = controller;
    // abort 后请求仍可能完成，提交结果时还需校验请求版本和当前筛选条件。
    const isCurrent = () => current.current.enabled && matches() &&
      request.sequence === sequence && !controller.signal.aborted;
    const setLoading = resource === "portfolios" ? setIsLoadingPortfolios :
      resource === "flatFunds" ? setIsLoadingFlatFunds : setIsLoadingPortfolioFunds;
    setLoading(!silent);
    setLoadErrors((previous) => ({ ...previous, [resource]: "" }));
    try {
      const data = await read(controller.signal);
      if (isCurrent()) apply(data);
    } catch (error) {
      if (!isCurrent()) return;
      const label = resource === "portfolios" ? "加载组合列表失败" :
        resource === "flatFunds" ? "加载全部基金失败" : "加载组合基金失败";
      setLoadErrors((previous) => ({
        ...previous,
        [resource]: error instanceof Error ? `${label}：${error.message}` : label
      }));
      throw error;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [cancelRequest]);

  const loadPortfolios = useCallback((silent = false) =>
    runRequest("portfolios", fetchPortfolios, setPortfolios, silent), [runRequest]);

  const loadFlatFunds = useCallback((silent = false) => runRequest(
    "flatFunds",
    (signal) => fetchFlatFunds(flatExpand, flatSortOrder, signal),
    setFlatFunds,
    silent,
    () => current.current.flatExpand === flatExpand && current.current.flatSortOrder === flatSortOrder
  ), [flatExpand, flatSortOrder, runRequest]);

  const loadSelectedPortfolioFunds = useCallback((portfolioId = current.current.selectedPortfolioId, silent = false) => {
    if (portfolioId === "all") {
      cancelRequest("portfolioFunds");
      setSelectedPortfolioMeta(null);
      setPortfolioFunds([]);
      setEditStateMap(new Map());
      setIsLoadingPortfolioFunds(false);
      setLoadErrors((previous) => ({ ...previous, portfolioFunds: "" }));
      return Promise.resolve();
    }
    return runRequest(
      "portfolioFunds",
      (signal) => fetchPortfolioFunds(portfolioId, signal),
      (data) => {
        setSelectedPortfolioMeta(data.portfolio);
        setPortfolioFunds(data.funds.slice().sort((a, b) => a.displayOrder - b.displayOrder));
        const next = new Map<string, FundEditState>();
        for (const item of data.funds) {
          next.set(item.fundCode, {
            holdingAmount: String(item.holdingAmount),
            plannedRatio: typeof item.plannedRatio === "number" ? String((item.plannedRatio * 100).toFixed(2)) : "",
            holdingProfitAmount: String(item.holdingProfitAmount)
          });
        }
        setEditStateMap(next);
      },
      silent,
      () => current.current.selectedPortfolioId === portfolioId
    );
  }, [cancelRequest, runRequest]);

  const refreshData = useCallback(async (options?: RefreshDataOptions) => {
    if (!current.current.enabled) return;
    const silent = options?.silent ?? false;
    const results = await Promise.allSettled([
      loadPortfolios(silent),
      loadFlatFunds(silent),
      options?.selectedPortfolioId === "all"
        ? Promise.resolve()
        : loadSelectedPortfolioFunds(options?.selectedPortfolioId, silent)
    ]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }, [loadPortfolios, loadFlatFunds, loadSelectedPortfolioFunds]);

  useEffect(() => {
    if (enabled) void loadPortfolios().catch(() => {});
    return () => cancelRequest("portfolios");
  }, [enabled, loadPortfolios, cancelRequest]);

  useEffect(() => {
    if (enabled) void loadFlatFunds().catch(() => {});
    return () => cancelRequest("flatFunds");
  }, [enabled, loadFlatFunds, cancelRequest]);

  useEffect(() => {
    if (enabled) {
      setSelectedPortfolioMeta(null);
      setPortfolioFunds([]);
      setEditStateMap(new Map());
      void loadSelectedPortfolioFunds(selectedPortfolioId).catch(() => {});
    }
    return () => cancelRequest("portfolioFunds");
  }, [enabled, selectedPortfolioId, loadSelectedPortfolioFunds, cancelRequest]);

  const markManualRefresh = () => {
    const nowText = formatBeijingTime(new Date().toISOString());
    setLastManualRefreshAt(nowText);
  };

  return {
    mainView,
    setMainView,
    selectedPortfolioId,
    flatExpand,
    setFlatExpand,
    flatSortOrder,
    setFlatSortOrder,
    estimateSortOrder,
    setEstimateSortOrder,
    portfolios,
    setPortfolios,
    flatFunds,
    setFlatFunds,
    portfolioFunds,
    setPortfolioFunds,
    selectedPortfolioMeta,
    setSelectedPortfolioMeta,
    editStateMap,
    setEditStateMap,
    isLoadingPortfolios,
    isLoadingFlatFunds,
    isLoadingPortfolioFunds,
    isLoading,
    setIsLoading,
    isReordering,
    setIsReordering,
    isBusy,
    statusText,
    setStatusText,
    errorText,
    lastManualRefreshAt,
    setLastManualRefreshAt,
    selectedPortfolioSummary,
    ratioAnalysisRows,
    estimateAnalysisRows,
    refreshData,
    markManualRefresh
  };
}

"use client";

import {
  FlatFundItem,
  PortfolioFundItem,
  PortfolioSummary,
  PortfolioType
} from "@digmo/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
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

export function useDashboardData() {
  const [mainView, setMainView] = useState<MainView>("overview");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("all");
  const [flatExpand, setFlatExpand] = useState<FlatExpandMode>("dedup");
  const [flatSortOrder, setFlatSortOrder] = useState<SortOrder>("default");
  const [estimateSortOrder, setEstimateSortOrder] = useState<SortOrder>("default");

  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([]);
  const [flatFunds, setFlatFunds] = useState<FlatFundItem[]>([]);
  const [portfolioFunds, setPortfolioFunds] = useState<PortfolioFundItem[]>([]);
  const [selectedPortfolioMeta, setSelectedPortfolioMeta] = useState<PortfolioMeta | null>(null);

  const [editStateMap, setEditStateMap] = useState<Map<string, FundEditState>>(new Map());

  const [isLoadingPortfolios, setIsLoadingPortfolios] = useState(true);
  const [isLoadingFlatFunds, setIsLoadingFlatFunds] = useState(true);
  const [isLoadingPortfolioFunds, setIsLoadingPortfolioFunds] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState("");

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
        typeof item.estimateChangePct === "number" ? item.estimateChangePct : undefined;
      const intradayAmount =
        typeof item.intradayAmount === "number"
          ? item.intradayAmount
          : typeof estimateChangePct === "number"
            ? Number((item.holdingAmount * estimateChangePct).toFixed(2))
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

  const loadPortfolios = useCallback(async () => {
    const next = await fetchPortfolios();
    setPortfolios(next);

    if (next.length === 0) {
      setSelectedPortfolioId("all");
      setSelectedPortfolioMeta(null);
      setPortfolioFunds([]);
      return;
    }

    if (
      selectedPortfolioId === "all" ||
      !next.some((item) => item.id === selectedPortfolioId)
    ) {
      setSelectedPortfolioId(next[0].id);
    }
  }, [selectedPortfolioId]);

  const loadFlatFunds = useCallback(async () => {
    const next = await fetchFlatFunds(flatExpand, flatSortOrder);
    setFlatFunds(next);
  }, [flatExpand, flatSortOrder]);

  const loadSelectedPortfolioFunds = useCallback(async () => {
    if (selectedPortfolioId === "all") {
      setPortfolioFunds([]);
      setSelectedPortfolioMeta(null);
      return;
    }

    const data = await fetchPortfolioFunds(selectedPortfolioId);
    setSelectedPortfolioMeta(data.portfolio);
    setPortfolioFunds(data.funds.slice().sort((a, b) => a.displayOrder - b.displayOrder));

    setEditStateMap(() => {
      const next = new Map<string, FundEditState>();
      for (const item of data.funds) {
        next.set(item.fundCode, {
          holdingAmount: String(item.holdingAmount),
          plannedRatio: typeof item.plannedRatio === "number" ? String((item.plannedRatio * 100).toFixed(2)) : "",
          holdingProfitAmount: String(item.holdingProfitAmount)
        });
      }
      return next;
    });
  }, [selectedPortfolioId]);

  const refreshData = useCallback(async (options?: RefreshDataOptions) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setIsLoadingPortfolios(true);
      setIsLoadingFlatFunds(true);
      setIsLoadingPortfolioFunds(true);
    }
    try {
      await Promise.all([loadPortfolios(), loadFlatFunds(), loadSelectedPortfolioFunds()]);
    } finally {
      if (!silent) {
        setIsLoadingPortfolios(false);
        setIsLoadingFlatFunds(false);
        setIsLoadingPortfolioFunds(false);
      }
    }
  }, [loadFlatFunds, loadPortfolios, loadSelectedPortfolioFunds]);

  useEffect(() => {
    setIsLoadingPortfolios(true);
    setErrorText("");
    void loadPortfolios()
      .catch((error) => {
        setErrorText(error instanceof Error ? error.message : "加载组合列表失败");
      })
      .finally(() => {
        setIsLoadingPortfolios(false);
      });
  }, [loadPortfolios]);

  useEffect(() => {
    setIsLoadingFlatFunds(true);
    setErrorText("");
    void loadFlatFunds()
      .catch((error) => {
        setErrorText(error instanceof Error ? error.message : "加载基金平铺失败");
      })
      .finally(() => {
        setIsLoadingFlatFunds(false);
      });
  }, [loadFlatFunds]);

  useEffect(() => {
    setIsLoadingPortfolioFunds(true);
    setErrorText("");
    void loadSelectedPortfolioFunds()
      .catch((error) => {
        setErrorText(error instanceof Error ? error.message : "加载组合基金失败");
      })
      .finally(() => {
        setIsLoadingPortfolioFunds(false);
      });
  }, [loadSelectedPortfolioFunds]);

  const markManualRefresh = () => {
    const nowText = formatBeijingTime(new Date().toISOString());
    setLastManualRefreshAt(nowText);
  };

  return {
    mainView,
    setMainView,
    selectedPortfolioId,
    setSelectedPortfolioId,
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
    setErrorText,
    lastManualRefreshAt,
    setLastManualRefreshAt,
    selectedPortfolioSummary,
    ratioAnalysisRows,
    estimateAnalysisRows,
    refreshData,
    markManualRefresh
  };
}

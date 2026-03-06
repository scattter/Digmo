"use client";

import {
  FlatFundItem,
  PortfolioDailyProfitV2Item,
  PortfolioDailyProfitV2Response,
  PortfolioFundItem,
  PortfolioSummary,
  PortfolioType
} from "@digmo/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchFlatFunds,
  fetchPortfolioFunds,
  fetchPortfolios,
  fetchPortfoliosDailyProfitV2,
  FlatExpandMode,
  SortOrder
} from "@/lib/api";
import { FundEditState, formatBeijingTime } from "@/lib/format";

export type MainView = "funds" | "portfolios";
export interface RefreshDataOptions {
  silent?: boolean;
}

export interface PortfolioMeta {
  id: string;
  name: string;
  type: PortfolioType;
}

type PortfolioDailyProfitV2Meta = Pick<PortfolioDailyProfitV2Response, "tradeDate" | "generatedAt" | "source">;

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
  const [mainView, setMainView] = useState<MainView>("portfolios");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("all");
  const [flatExpand, setFlatExpand] = useState<FlatExpandMode>("dedup");
  const [flatSortOrder, setFlatSortOrder] = useState<SortOrder>("default");
  const [estimateSortOrder, setEstimateSortOrder] = useState<SortOrder>("default");

  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([]);
  const [portfolioDailyProfitV2, setPortfolioDailyProfitV2] = useState<PortfolioDailyProfitV2Item[]>([]);
  const [portfolioDailyProfitV2Meta, setPortfolioDailyProfitV2Meta] = useState<PortfolioDailyProfitV2Meta | null>(null);
  const [flatFunds, setFlatFunds] = useState<FlatFundItem[]>([]);
  const [portfolioFunds, setPortfolioFunds] = useState<PortfolioFundItem[]>([]);
  const [selectedPortfolioMeta, setSelectedPortfolioMeta] = useState<PortfolioMeta | null>(null);

  const [editStateMap, setEditStateMap] = useState<Map<string, FundEditState>>(new Map());

  const [isLoadingPortfolios, setIsLoadingPortfolios] = useState(true);
  const [isLoadingPortfolioDailyProfitV2, setIsLoadingPortfolioDailyProfitV2] = useState(true);
  const [isLoadingFlatFunds, setIsLoadingFlatFunds] = useState(true);
  const [isLoadingPortfolioFunds, setIsLoadingPortfolioFunds] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState("");

  const isLoading =
    isLoadingPortfolios || isLoadingPortfolioDailyProfitV2 || isLoadingFlatFunds || isLoadingPortfolioFunds || isActionLoading;
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
      const estimateChangePct = typeof item.estimateChangePct === "number" ? item.estimateChangePct : 0;
      const intradayAmount =
        typeof item.intradayAmount === "number"
          ? item.intradayAmount
          : Number((item.holdingAmount * estimateChangePct).toFixed(2));

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
      const diff =
        estimateSortOrder === "asc"
          ? a.estimateChangePct - b.estimateChangePct
          : b.estimateChangePct - a.estimateChangePct;
      if (Math.abs(diff) > 0.0000001) {
        return diff;
      }
      return a.order - b.order;
    });
  }, [portfolioFunds, estimateSortOrder]);

  const loadPortfolios = useCallback(async () => {
    const next = await fetchPortfolios();
    setPortfolios(next);

    if (selectedPortfolioId !== "all" && !next.some((item) => item.id === selectedPortfolioId)) {
      setSelectedPortfolioId("all");
      setSelectedPortfolioMeta(null);
      setPortfolioFunds([]);
    }
  }, [selectedPortfolioId]);

  const loadPortfoliosDailyProfitV2 = useCallback(async () => {
    const next = await fetchPortfoliosDailyProfitV2();
    setPortfolioDailyProfitV2(next.portfolios);
    setPortfolioDailyProfitV2Meta({
      tradeDate: next.tradeDate,
      generatedAt: next.generatedAt,
      source: next.source
    });
  }, []);

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
      setIsLoadingPortfolioDailyProfitV2(true);
      setIsLoadingFlatFunds(true);
      setIsLoadingPortfolioFunds(true);
    }
    try {
      await Promise.all([loadPortfolios(), loadPortfoliosDailyProfitV2(), loadFlatFunds(), loadSelectedPortfolioFunds()]);
    } finally {
      if (!silent) {
        setIsLoadingPortfolios(false);
        setIsLoadingPortfolioDailyProfitV2(false);
        setIsLoadingFlatFunds(false);
        setIsLoadingPortfolioFunds(false);
      }
    }
  }, [loadFlatFunds, loadPortfolios, loadPortfoliosDailyProfitV2, loadSelectedPortfolioFunds]);

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
    setIsLoadingPortfolioDailyProfitV2(true);
    setErrorText("");
    void loadPortfoliosDailyProfitV2()
      .catch((error) => {
        setErrorText(error instanceof Error ? error.message : "加载 v2 组合当日收益失败");
      })
      .finally(() => {
        setIsLoadingPortfolioDailyProfitV2(false);
      });
  }, [loadPortfoliosDailyProfitV2]);

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
    portfolioDailyProfitV2,
    portfolioDailyProfitV2Meta,
    flatFunds,
    setFlatFunds,
    portfolioFunds,
    setPortfolioFunds,
    selectedPortfolioMeta,
    setSelectedPortfolioMeta,
    editStateMap,
    setEditStateMap,
    isLoadingPortfolios,
    isLoadingPortfolioDailyProfitV2,
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

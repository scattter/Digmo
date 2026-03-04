"use client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FlatFundItem, PortfolioFundItem, PortfolioSummary, PortfolioType, TrendType } from "@digmo/shared";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  addPortfolioFund,
  createPortfolio,
  deletePortfolio,
  fetchFlatFunds,
  fetchPortfolioFunds,
  fetchPortfolios,
  FlatExpandMode,
  reorderPortfolioFunds,
  removePortfolioFund,
  renamePortfolio,
  SortOrder,
  updatePortfolioFund
} from "../lib/api";

type MainView = "funds" | "portfolios";

interface PortfolioMeta {
  id: string;
  name: string;
  type: PortfolioType;
}

interface FundEditState {
  holdingAmount: string;
  plannedRatio: string;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatSignedAmount(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatCurrency(value)}`;
}

function formatSignedCurrency(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}¥${formatCurrency(Math.abs(value))}`;
}

function formatSignedPct(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }

  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function formatPct(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatBeijingTime(input: string): string {
  return new Date(input).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function trendClass(trend: TrendType): string {
  if (trend === "UP") {
    return "trend trend-up";
  }
  if (trend === "DOWN") {
    return "trend trend-down";
  }
  return "trend trend-flat";
}

function parseNonNegativeNumber(raw: string): number | undefined {
  const normalized = raw.trim().replace(/,/g, "");
  if (!normalized) {
    return undefined;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Number(value.toFixed(2));
}

function parseRatioPercent(raw: string): number | undefined {
  const normalized = raw.trim().replace("%", "");
  if (!normalized) {
    return undefined;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return undefined;
  }
  return Number((value / 100).toFixed(6));
}

function nextFlatSortOrder(current: SortOrder): SortOrder {
  if (current === "default") {
    return "desc";
  }
  if (current === "desc") {
    return "asc";
  }
  return "default";
}

function getFlatSortButtonLabel(order: SortOrder): string {
  if (order === "desc") {
    return "涨幅排序 ↓";
  }
  if (order === "asc") {
    return "涨幅排序 ↑";
  }
  return "涨幅排序";
}

function getEstimateSortButtonLabel(order: SortOrder): string {
  if (order === "desc") {
    return "今日预估排序 ↓";
  }
  if (order === "asc") {
    return "今日预估排序 ↑";
  }
  return "今日预估排序";
}

function deltaClassByPct(value: number): string {
  if (value > 0.0001) {
    return "delta-up";
  }
  if (value < -0.0001) {
    return "delta-down";
  }
  return "delta-neutral";
}

interface SortablePortfolioFundCardProps {
  item: PortfolioFundItem;
  edit: FundEditState;
  isBusy: boolean;
  onEditFieldChange: (fundCode: string, key: keyof FundEditState, value: string) => void;
  onUpdateFund: (item: PortfolioFundItem) => Promise<void>;
  onDeleteFund: (item: PortfolioFundItem) => Promise<void>;
}

function SortablePortfolioFundCard(props: SortablePortfolioFundCardProps) {
  const { item, edit, isBusy, onEditFieldChange, onUpdateFund, onDeleteFund } = props;
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.fundCode,
    disabled: isBusy
  });

  return (
    <article
      className={`card card-compact sortable-fund-card ${isDragging ? "sortable-fund-card-dragging" : ""}`}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
    >
      <header className="card-head">
        <div className="card-head-left">
          <button
            className="drag-handle"
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`拖拽排序 ${item.fundName ?? item.fundCode}`}
            disabled={isBusy}
          >
            ⋮⋮
          </button>
          <div className="fund">{item.fundName ?? `基金 ${item.fundCode}`}</div>
        </div>
        <span className={trendClass(item.trend)}>{item.trend}</span>
      </header>
      <p className="code">基金代码: {item.fundCode}</p>
      <p className="code">持仓金额: ¥{formatCurrency(item.holdingAmount)}</p>
      <p className="code">历史总收益: {formatSignedAmount(item.totalProfitAmount)}</p>
      <p className="code">历史总涨跌: {formatSignedPct(item.totalChangePct)}</p>
      <p className={item.trend === "UP" ? "delta-up" : item.trend === "DOWN" ? "delta-down" : "delta-neutral"}>
        盘中估算涨跌: {formatSignedPct(item.estimateChangePct)}
      </p>
      {item.portfolioType === "RATIO" ? (
        <>
          <p className="code">计划比例: {formatPct(item.plannedRatio)}</p>
          <p className="code">实际比例: {formatPct(item.actualRatio)}</p>
        </>
      ) : null}

      <div className="holding-editor">
        <input
          className="text-input holding-input"
          type="text"
          inputMode="decimal"
          value={edit.holdingAmount}
          onChange={(event) => onEditFieldChange(item.fundCode, "holdingAmount", event.target.value)}
          disabled={isBusy}
        />
        {item.portfolioType === "RATIO" ? (
          <input
            className="text-input holding-input"
            type="text"
            inputMode="decimal"
            value={edit.plannedRatio}
            onChange={(event) => onEditFieldChange(item.fundCode, "plannedRatio", event.target.value)}
            disabled={isBusy}
          />
        ) : null}
        <button className="btn-secondary btn-small" type="button" onClick={() => void onUpdateFund(item)} disabled={isBusy}>
          更新
        </button>
        <button className="btn-link-danger" type="button" onClick={() => void onDeleteFund(item)} disabled={isBusy}>
          删除
        </button>
      </div>
    </article>
  );
}

export default function FundDashboard() {
  const [mainView, setMainView] = useState<MainView>("portfolios");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("all");
  const [flatExpand, setFlatExpand] = useState<FlatExpandMode>("dedup");
  const [flatSortOrder, setFlatSortOrder] = useState<SortOrder>("default");
  const [estimateSortOrder, setEstimateSortOrder] = useState<SortOrder>("default");

  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([]);
  const [flatFunds, setFlatFunds] = useState<FlatFundItem[]>([]);
  const [portfolioFunds, setPortfolioFunds] = useState<PortfolioFundItem[]>([]);
  const [selectedPortfolioMeta, setSelectedPortfolioMeta] = useState<PortfolioMeta | null>(null);

  const [createPortfolioName, setCreatePortfolioName] = useState("");
  const [createPortfolioType, setCreatePortfolioType] = useState<PortfolioType>("FREE");

  const [addFundCode, setAddFundCode] = useState("");
  const [addFundHoldingAmount, setAddFundHoldingAmount] = useState("");
  const [addFundPlannedRatio, setAddFundPlannedRatio] = useState("");

  const [editStateMap, setEditStateMap] = useState<Map<string, FundEditState>>(new Map());

  const [isLoading, setIsLoading] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 8
      }
    })
  );

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

        const plannedRatio = item.plannedRatio;
        const actualRatio = item.actualRatio;
        const overPlannedRatio = actualRatio - plannedRatio;
        const overByMoreThan15Pct = overPlannedRatio > 0.15;

        return {
          fundCode: item.fundCode,
          fundName: item.fundName ?? `基金 ${item.fundCode}`,
          plannedRatio,
          actualRatio,
          overByMoreThan15Pct
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
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
  const isBusy = isLoading || isReordering;

  const loadPortfolios = useCallback(async () => {
    const next = await fetchPortfolios();
    setPortfolios(next);

    if (selectedPortfolioId !== "all" && !next.some((item) => item.id === selectedPortfolioId)) {
      setSelectedPortfolioId("all");
      setSelectedPortfolioMeta(null);
      setPortfolioFunds([]);
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
          plannedRatio: typeof item.plannedRatio === "number" ? String((item.plannedRatio * 100).toFixed(2)) : ""
        });
      }
      return next;
    });
  }, [selectedPortfolioId]);

  const refreshData = useCallback(async () => {
    await Promise.all([loadPortfolios(), loadFlatFunds(), loadSelectedPortfolioFunds()]);
  }, [loadFlatFunds, loadPortfolios, loadSelectedPortfolioFunds]);

  useEffect(() => {
    setIsLoading(true);
    setErrorText("");
    void loadPortfolios()
      .catch((error) => {
        setErrorText(error instanceof Error ? error.message : "加载组合列表失败");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [loadPortfolios]);

  useEffect(() => {
    setIsLoading(true);
    setErrorText("");
    void loadFlatFunds()
      .catch((error) => {
        setErrorText(error instanceof Error ? error.message : "加载基金平铺失败");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [loadFlatFunds]);

  useEffect(() => {
    setIsLoading(true);
    setErrorText("");
    void loadSelectedPortfolioFunds()
      .catch((error) => {
        setErrorText(error instanceof Error ? error.message : "加载组合基金失败");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [loadSelectedPortfolioFunds]);

  async function onCreatePortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = createPortfolioName.trim();
    if (!name) {
      setErrorText("请输入组合名称");
      return;
    }

    setIsLoading(true);
    setErrorText("");
    setStatusText("");

    try {
      await createPortfolio(name, createPortfolioType);
      setCreatePortfolioName("");
      await refreshData();
      setStatusText(`已创建组合: ${name}`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "创建组合失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function onRenamePortfolio(portfolio: PortfolioSummary) {
    const nextName = window.prompt("请输入新的组合名称", portfolio.name);
    if (!nextName || !nextName.trim() || nextName.trim() === portfolio.name) {
      return;
    }

    setIsLoading(true);
    setErrorText("");
    setStatusText("");
    try {
      await renamePortfolio(portfolio.id, nextName.trim());
      await refreshData();
      setStatusText(`已重命名组合为 ${nextName.trim()}`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "重命名失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function onDeletePortfolio(portfolio: PortfolioSummary) {
    if (!window.confirm(`确认删除组合「${portfolio.name}」吗？`)) {
      return;
    }

    setIsLoading(true);
    setErrorText("");
    setStatusText("");

    try {
      await deletePortfolio(portfolio.id);
      if (selectedPortfolioId === portfolio.id) {
        setSelectedPortfolioId("all");
      }
      await refreshData();
      setStatusText(`已删除组合 ${portfolio.name}`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "删除组合失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function onAddFundToPortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPortfolioMeta) {
      setErrorText("请先选择具体组合再添加基金");
      return;
    }

    const fundCode = addFundCode.trim();
    if (!/^\d{6}$/.test(fundCode)) {
      setErrorText("基金代码格式不正确，请输入 6 位数字");
      return;
    }

    const holdingAmount = parseNonNegativeNumber(addFundHoldingAmount);
    if (holdingAmount === undefined) {
      setErrorText("持仓金额格式错误，请输入大于等于 0 的数字");
      return;
    }

    let plannedRatio: number | undefined;
    if (selectedPortfolioMeta.type === "RATIO") {
      plannedRatio = parseRatioPercent(addFundPlannedRatio);
      if (plannedRatio === undefined) {
        setErrorText("按比例组合请填写 0-100 的计划比例");
        return;
      }
    }

    setIsLoading(true);
    setErrorText("");
    setStatusText("");

    try {
      await addPortfolioFund({
        portfolioId: selectedPortfolioMeta.id,
        fundCode,
        holdingAmount,
        plannedRatio
      });

      setAddFundCode("");
      setAddFundHoldingAmount("");
      setAddFundPlannedRatio("");
      await refreshData();
      setStatusText(`已添加基金 ${fundCode}`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "添加基金失败");
    } finally {
      setIsLoading(false);
    }
  }

  function onEditFieldChange(fundCode: string, key: keyof FundEditState, value: string) {
    setEditStateMap((prev) => {
      const next = new Map(prev);
      const current = next.get(fundCode) ?? {
        holdingAmount: "",
        plannedRatio: ""
      };
      next.set(fundCode, {
        ...current,
        [key]: value
      });
      return next;
    });
  }

  async function onUpdateFund(item: PortfolioFundItem) {
    const edit = editStateMap.get(item.fundCode);
    if (!edit) {
      return;
    }

    const holdingAmount = parseNonNegativeNumber(edit.holdingAmount);
    if (holdingAmount === undefined) {
      setErrorText("持仓金额格式错误");
      return;
    }

    let plannedRatio: number | undefined;
    if (item.portfolioType === "RATIO") {
      plannedRatio = parseRatioPercent(edit.plannedRatio);
      if (plannedRatio === undefined) {
        setErrorText("计划比例格式错误，请输入 0-100");
        return;
      }
    }

    setIsLoading(true);
    setErrorText("");
    setStatusText("");

    try {
      await updatePortfolioFund({
        portfolioId: item.portfolioId,
        fundCode: item.fundCode,
        holdingAmount,
        plannedRatio
      });
      await refreshData();
      setStatusText(`已更新基金 ${item.fundCode}`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "更新基金失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function onDeleteFund(item: PortfolioFundItem) {
    if (!window.confirm(`确认从组合移除基金 ${item.fundCode} 吗？`)) {
      return;
    }

    setIsLoading(true);
    setErrorText("");
    setStatusText("");

    try {
      await removePortfolioFund(item.portfolioId, item.fundCode);
      await refreshData();
      setStatusText(`已移除基金 ${item.fundCode}`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "移除基金失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function persistPortfolioFundOrder(previous: PortfolioFundItem[], next: PortfolioFundItem[]) {
    if (selectedPortfolioId === "all") {
      return;
    }

    setIsReordering(true);
    setErrorText("");
    setStatusText("");

    try {
      await reorderPortfolioFunds(
        selectedPortfolioId,
        next.map((item) => item.fundCode)
      );
      setStatusText("已更新组合基金顺序。");
    } catch (error) {
      setPortfolioFunds(previous);
      setErrorText(error instanceof Error ? error.message : "基金重排序失败");
    } finally {
      setIsReordering(false);
    }
  }

  function onPortfolioFundsDragEnd(event: DragEndEvent) {
    if (selectedPortfolioId === "all" || isReordering) {
      return;
    }

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = portfolioFunds.findIndex((item) => item.fundCode === String(active.id));
    const newIndex = portfolioFunds.findIndex((item) => item.fundCode === String(over.id));

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const previous = portfolioFunds;
    const reordered = arrayMove(portfolioFunds, oldIndex, newIndex).map((item, index) => ({
      ...item,
      displayOrder: index
    }));

    setPortfolioFunds(reordered);
    void persistPortfolioFundOrder(previous, reordered);
  }

  async function onManualRefresh() {
    setIsLoading(true);
    setErrorText("");
    setStatusText("");

    try {
      await refreshData();
      const nowText = formatBeijingTime(new Date().toISOString());
      setLastManualRefreshAt(nowText);
      setStatusText("已手动更新全部数据。");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "手动更新失败");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main>
      <section className="header">
        <div>
          <h1 className="title">Digmo 组合与基金视图</h1>
          <p className="subtitle">支持基金平铺与组合管理，组合总收益采用「金额/比例」统一展示。</p>
        </div>
        <span className="badge">Portfolio MVP</span>
      </section>

      <section className="actions">
        <div className="main-view-switch" role="group" aria-label="主视图切换">
          <button
            className={`mode-btn ${mainView === "portfolios" ? "mode-btn-active" : ""}`}
            type="button"
            onClick={() => setMainView("portfolios")}
          >
            组合视图
          </button>
          <button
            className={`mode-btn ${mainView === "funds" ? "mode-btn-active" : ""}`}
            type="button"
            onClick={() => setMainView("funds")}
          >
            基金平铺
          </button>
          <button className="btn-secondary" type="button" onClick={onManualRefresh} disabled={isBusy}>
            手动更新
          </button>
        </div>

        {mainView === "portfolios" ? (
          <form className="create-portfolio-form" onSubmit={onCreatePortfolio}>
            <input
              className="text-input"
              type="text"
              placeholder="新组合名称"
              value={createPortfolioName}
              onChange={(event) => setCreatePortfolioName(event.target.value)}
              disabled={isBusy}
            />
            <select
              className="text-input select-input"
              value={createPortfolioType}
              onChange={(event) => setCreatePortfolioType(event.target.value as PortfolioType)}
              disabled={isBusy}
            >
              <option value="FREE">自由组合</option>
              <option value="RATIO">按比例组合</option>
            </select>
            <button className="btn-primary" type="submit" disabled={isBusy}>
              创建组合
            </button>
          </form>
        ) : null}

        {mainView === "funds" ? (
          <div className="flat-tools">
            <div className="mode-switch" role="group" aria-label="平铺展开模式">
              <button
                type="button"
                className={`mode-btn ${flatExpand === "dedup" ? "mode-btn-active" : ""}`}
                onClick={() => setFlatExpand("dedup")}
              >
                去重汇总
              </button>
              <button
                type="button"
                className={`mode-btn ${flatExpand === "expanded" ? "mode-btn-active" : ""}`}
                onClick={() => setFlatExpand("expanded")}
              >
                按组合展开
              </button>
            </div>
            <div className="mode-switch" role="group" aria-label="涨幅排序">
              <button
                type="button"
                className={`mode-btn ${flatSortOrder === "default" ? "" : "mode-btn-active"}`}
                onClick={() => setFlatSortOrder((prev) => nextFlatSortOrder(prev))}
              >
                {getFlatSortButtonLabel(flatSortOrder)}
              </button>
            </div>
          </div>
        ) : (
          <div className="portfolio-tabs" role="tablist" aria-label="组合选择">
            <button
              className={`mode-btn ${selectedPortfolioId === "all" ? "mode-btn-active" : ""}`}
              type="button"
              onClick={() => setSelectedPortfolioId("all")}
            >
              全部组合
            </button>
            {portfolios.map((portfolio) => (
              <button
                className={`mode-btn ${selectedPortfolioId === portfolio.id ? "mode-btn-active" : ""}`}
                key={portfolio.id}
                type="button"
                onClick={() => setSelectedPortfolioId(portfolio.id)}
              >
                {portfolio.name}
              </button>
            ))}
          </div>
        )}

        <div className="status-line">
          {statusText ? <p className="delta-up">{statusText}</p> : null}
          {errorText ? <p className="delta-down">{errorText}</p> : null}
          {lastManualRefreshAt ? (
            <p className="code">最近手动更新: {lastManualRefreshAt}</p>
          ) : (
            <p className="code">当前为手动更新模式，不会自动刷新。</p>
          )}
        </div>
      </section>

      {mainView === "funds" ? (
        <section className="grid grid-compact">
          {flatFunds.length === 0 ? (
            <article className="card card-compact">
              <div className="fund">暂无基金数据</div>
              <p className="code">请先创建组合并添加基金。</p>
            </article>
          ) : null}

          {flatFunds.map((item) => (
            <article className="card card-compact" key={`${item.fundCode}-${item.portfolioId ?? "all"}`}>
              <header className="card-head">
                <div className="fund">{item.fundName ?? `基金 ${item.fundCode}`}</div>
                <span className={trendClass(item.trend)}>{item.trend}</span>
              </header>
              <p className="code">基金代码: {item.fundCode}</p>
              <p className="code">总持仓金额: ¥{formatCurrency(item.holdingAmount)}</p>
              <p className="code">历史总涨跌: {formatSignedPct(item.totalChangePct)}</p>
              <p className={item.trend === "UP" ? "delta-up" : item.trend === "DOWN" ? "delta-down" : "delta-neutral"}>
                盘中估算涨跌: {formatSignedPct(item.estimateChangePct)}
              </p>
              <p className="code">
                {flatExpand === "dedup"
                  ? `所属组合(${item.portfolioCount}): ${item.portfolioNames.join(" / ") || "-"}`
                  : `所属组合: ${item.portfolioName ?? "-"}`}
              </p>
              <p className="card-actions">
                <Link href={`/funds/${item.fundCode}`}>查看详情</Link>
              </p>
            </article>
          ))}
        </section>
      ) : (
        <>
          {selectedPortfolioId === "all" ? (
            <section className="grid grid-compact">
              {portfolios.length === 0 ? (
                <article className="card card-compact">
                  <div className="fund">暂无组合</div>
                  <p className="code">请先创建组合。</p>
                </article>
              ) : null}

              {portfolios.map((portfolio) => (
                <article className="card card-compact" key={portfolio.id}>
                  <header className="card-head">
                    <div className="fund">{portfolio.name}</div>
                    <span className="badge">{portfolio.type === "FREE" ? "自由" : "按比例"}</span>
                  </header>
                  <p className="code">组合总金额: ¥{formatCurrency(portfolio.totalAmount)}</p>
                  <p className={portfolio.totalProfitAmount >= 0 ? "delta-up" : "delta-down"}>
                    组合总收益: {portfolio.totalProfitDisplay}
                  </p>
                  <p className="code">当日预估涨幅: {formatSignedPct(portfolio.intradayEstimatePct)}</p>
                  <p className="code">基金数量: {portfolio.fundCount}</p>
                  <div className="card-actions">
                    <button className="btn-secondary btn-small" type="button" onClick={() => onRenamePortfolio(portfolio)}>
                      重命名
                    </button>
                    <button className="btn-link-danger" type="button" onClick={() => onDeletePortfolio(portfolio)}>
                      删除
                    </button>
                    <button className="btn-secondary btn-small" type="button" onClick={() => setSelectedPortfolioId(portfolio.id)}>
                      打开
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ) : (
            <>
              <section className="actions inner-actions">
                <h2 className="section-title">
                  {selectedPortfolioMeta?.name ?? "当前组合"}
                  {selectedPortfolioSummary ? ` · ${selectedPortfolioSummary.type === "FREE" ? "自由组合" : "按比例组合"}` : ""}
                </h2>
                <form className="add-fund-form" onSubmit={onAddFundToPortfolio}>
                  <div className="control-row">
                    <input
                      className="text-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="基金代码(6位)"
                      value={addFundCode}
                      onChange={(event) => setAddFundCode(event.target.value)}
                      disabled={isBusy}
                    />
                    <input
                      className="text-input"
                      type="text"
                      inputMode="decimal"
                      placeholder="持仓金额"
                      value={addFundHoldingAmount}
                      onChange={(event) => setAddFundHoldingAmount(event.target.value)}
                      disabled={isBusy}
                    />
                    {selectedPortfolioMeta?.type === "RATIO" ? (
                      <input
                        className="text-input"
                        type="text"
                        inputMode="decimal"
                        placeholder="计划比例(%)"
                        value={addFundPlannedRatio}
                        onChange={(event) => setAddFundPlannedRatio(event.target.value)}
                        disabled={isBusy}
                      />
                    ) : null}
                    <button className="btn-primary" type="submit" disabled={isBusy}>
                      添加基金
                    </button>
                  </div>
                </form>
              </section>

              <section className="portfolio-analysis">
                <article className="analysis-panel">
                  <div className="analysis-header">
                    <h3 className="section-title">比例达成</h3>
                    {selectedPortfolioMeta?.type === "RATIO" ? (
                      <p className="code">实际低于计划或超配不超过 10% 时为灰色；超配超过 15% 标为提醒色。</p>
                    ) : (
                      <p className="code">自由组合无计划比例，不展示比例达成图。</p>
                    )}
                  </div>

                  {selectedPortfolioMeta?.type === "RATIO" ? (
                    ratioAnalysisRows.length === 0 ? (
                      <p className="code">当前组合暂无可分析的比例数据。</p>
                    ) : (
                      <div className="ratio-chart">
                        {ratioAnalysisRows.map((row) => (
                          <div className="ratio-row" key={row.fundCode}>
                            <div className="ratio-row-head">
                              <span className="fund">{row.fundName}</span>
                              <span className="code">{row.fundCode}</span>
                            </div>
                            <div className="ratio-line">
                              <span className="ratio-line-label">计划</span>
                              <div className="ratio-track">
                                <div
                                  className="ratio-fill ratio-fill-neutral"
                                  style={{ width: `${Math.max(0, Math.min(100, row.plannedRatio * 100))}%` }}
                                />
                              </div>
                              <span className="ratio-line-value">{formatPct(row.plannedRatio)}</span>
                            </div>
                            <div className="ratio-line">
                              <span className="ratio-line-label">实际</span>
                              <div className="ratio-track">
                                <div
                                  className={`ratio-fill ${row.overByMoreThan15Pct ? "ratio-fill-warn" : "ratio-fill-neutral"}`}
                                  style={{ width: `${Math.max(0, Math.min(100, row.actualRatio * 100))}%` }}
                                />
                              </div>
                              <span className="ratio-line-value">{formatPct(row.actualRatio)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : null}
                </article>

                <article className="analysis-panel">
                  <div className="analysis-header">
                    <h3 className="section-title">今日预估</h3>
                    <button
                      type="button"
                      className={`mode-btn ${estimateSortOrder === "default" ? "" : "mode-btn-active"}`}
                      onClick={() => setEstimateSortOrder((prev) => nextFlatSortOrder(prev))}
                      disabled={isBusy}
                    >
                      {getEstimateSortButtonLabel(estimateSortOrder)}
                    </button>
                  </div>

                  {estimateAnalysisRows.length === 0 ? (
                    <p className="code">当前组合暂无基金数据。</p>
                  ) : (
                    <div className="estimate-list">
                      {estimateAnalysisRows.map((row) => (
                        <div className="estimate-item" key={row.fundCode}>
                          <div className="estimate-item-head">
                            <span className="fund">{row.fundName}</span>
                            <span className="code">{row.fundCode}</span>
                          </div>
                          <p className={deltaClassByPct(row.estimateChangePct)}>
                            {formatSignedCurrency(row.intradayAmount)} / {formatSignedPct(row.estimateChangePct)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </section>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onPortfolioFundsDragEnd}>
                <SortableContext items={portfolioFunds.map((item) => item.fundCode)} strategy={rectSortingStrategy}>
                  <section className="grid grid-compact">
                    {portfolioFunds.length === 0 ? (
                      <article className="card card-compact">
                        <div className="fund">当前组合暂无基金</div>
                        <p className="code">请通过上方表单添加基金。</p>
                      </article>
                    ) : null}

                    {portfolioFunds.map((item) => {
                      const edit = editStateMap.get(item.fundCode) ?? {
                        holdingAmount: String(item.holdingAmount),
                        plannedRatio: typeof item.plannedRatio === "number" ? String((item.plannedRatio * 100).toFixed(2)) : ""
                      };

                      return (
                        <SortablePortfolioFundCard
                          key={`${item.portfolioId}-${item.fundCode}`}
                          item={item}
                          edit={edit}
                          isBusy={isBusy}
                          onEditFieldChange={onEditFieldChange}
                          onUpdateFund={onUpdateFund}
                          onDeleteFund={onDeleteFund}
                        />
                      );
                    })}
                  </section>
                </SortableContext>
              </DndContext>
            </>
          )}
        </>
      )}
    </main>
  );
}

"use client";

import { BatchEstimateResponse, FundEstimateSnapshot } from "@digmo/shared";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addWatchlistFund,
  fetchBatchEstimates,
  fetchWatchlistFunds,
  removeWatchlistFund,
  updateWatchlistFundHoldingAmount
} from "../lib/api";

function deltaClass(value: number): string {
  if (value > 0.0001) return "delta-up";
  if (value < -0.0001) return "delta-down";
  return "delta-neutral";
}

function formatMarketCap(value?: number): string {
  if (typeof value !== "number") {
    return "-";
  }
  return `${(value / 100000000).toFixed(2)}亿`;
}

function toMap(items: FundEstimateSnapshot[]): Map<string, FundEstimateSnapshot> {
  return new Map(items.map((item) => [item.fundCode, item]));
}

function formatBeijingTime(input: string): string {
  return new Date(input).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function formatCurrency(value: number): string {
  const fixed = value.toFixed(2);
  const [integerPart, decimalPart] = fixed.split(".");
  const isNegative = integerPart.startsWith("-");
  const digits = isNegative ? integerPart.slice(1) : integerPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${isNegative ? "-" : ""}${grouped}.${decimalPart}`;
}

function formatSignedAmount(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatCurrency(value)}`;
}

function formatSignedRatioPct(value: number): string {
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function formatDayReturn(holdingAmount: number, dayChangePct: number): string {
  const amountText = formatSignedAmount(holdingAmount * dayChangePct);
  return `${amountText} / ${formatSignedRatioPct(dayChangePct)}`;
}

function parseHoldingAmountInput(raw: string): number | undefined {
  const normalized = raw.trim().replace(/,/g, "");
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return Number(parsed.toFixed(2));
}

type DisplayMode = "detailed" | "compact";

interface FundMeta {
  holdingAmount: number;
  totalChangePct: number;
  createdAt?: string;
  lastAccumulatedNavDate?: string;
}

interface SnapshotVM {
  fundCode: string;
  snapshot?: FundEstimateSnapshot;
  meta: FundMeta;
}

const EMPTY_META: FundMeta = {
  holdingAmount: 0,
  totalChangePct: 0
};

export default function FundDashboard() {
  const hasLoadedRef = useRef(false);
  const activeHoldingEditorRef = useRef<HTMLDivElement | null>(null);
  const [fundCodes, setFundCodes] = useState<string[]>([]);
  const [estimateMap, setEstimateMap] = useState<Map<string, FundEstimateSnapshot>>(new Map());
  const [fundMetaMap, setFundMetaMap] = useState<Map<string, FundMeta>>(new Map());
  const [partialFailed, setPartialFailed] = useState<string[]>([]);
  const [inputCode, setInputCode] = useState("");
  const [inputHoldingAmount, setInputHoldingAmount] = useState("");
  const [holdingEditMap, setHoldingEditMap] = useState<Map<string, string>>(new Map());
  const [activeHoldingEditorCode, setActiveHoldingEditorCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [errorText, setErrorText] = useState<string>("");
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState<string>("");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("compact");

  const snapshots = useMemo<SnapshotVM[]>(() => {
    return fundCodes.map((code) => ({
      fundCode: code,
      snapshot: estimateMap.get(code),
      meta: fundMetaMap.get(code) ?? EMPTY_META
    }));
  }, [estimateMap, fundCodes, fundMetaMap]);

  const refresh = useCallback(async (codes: string[]): Promise<BatchEstimateResponse> => {
    if (codes.length === 0) {
      setEstimateMap(new Map());
      setPartialFailed([]);
      return {
        data: [],
        partialFailed: []
      };
    }

    const response = await fetchBatchEstimates(codes);
    setEstimateMap(toMap(response.data));
    setPartialFailed(response.partialFailed);
    return response;
  }, []);

  const loadWatchlist = useCallback(async () => {
    const funds = await fetchWatchlistFunds();
    const codes = funds.map((item) => item.fundCode);
    const nextMetaMap = new Map<string, FundMeta>();
    for (const item of funds) {
      nextMetaMap.set(item.fundCode, {
        holdingAmount: item.holdingAmount,
        totalChangePct: item.totalChangePct,
        createdAt: item.createdAt,
        lastAccumulatedNavDate: item.lastAccumulatedNavDate
      });
    }

    setFundCodes(codes);
    setFundMetaMap(nextMetaMap);
    await refresh(codes);
  }, [refresh]);

  useEffect(() => {
    if (hasLoadedRef.current) {
      return;
    }
    hasLoadedRef.current = true;

    setIsLoading(true);
    setErrorText("");
    void loadWatchlist()
      .catch((error) => {
        setErrorText(error instanceof Error ? error.message : "加载关注基金失败，请稍后重试。");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [loadWatchlist]);

  async function onManualRefresh() {
    if (fundCodes.length === 0) {
      setStatusText("当前没有关注基金，请先添加基金代码。");
      setErrorText("");
      return;
    }

    setIsLoading(true);
    setErrorText("");
    setStatusText("");

    try {
      await loadWatchlist();
      setLastManualRefreshAt(formatBeijingTime(new Date().toISOString()));
      setStatusText("已手动更新全部关注基金。");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "手动更新失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  async function onAddFund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextCode = inputCode.trim();
    const holdingAmountInput = inputHoldingAmount.trim();
    let nextHoldingAmount: number | undefined;

    if (!/^\d{6}$/.test(nextCode)) {
      setErrorText("基金代码格式不正确，请输入 6 位数字。");
      setStatusText("");
      return;
    }

    if (holdingAmountInput.length > 0) {
      const parsed = parseHoldingAmountInput(holdingAmountInput);
      if (parsed === undefined) {
        setErrorText("持仓金额格式不正确，请输入大于等于 0 的数字。");
        setStatusText("");
        return;
      }
      nextHoldingAmount = parsed;
    }

    const existed = fundCodes.includes(nextCode);
    if (existed && nextHoldingAmount === undefined) {
      setErrorText("该基金代码已在关注列表中。如需更新金额，请填写持仓金额后再次提交。");
      setStatusText("");
      return;
    }

    setIsLoading(true);
    setErrorText("");
    setStatusText("");

    try {
      await addWatchlistFund(nextCode, nextHoldingAmount);
      await loadWatchlist();
      setInputCode("");
      setInputHoldingAmount("");
      setStatusText(existed ? `已更新基金 ${nextCode} 的持仓金额。` : `已添加基金 ${nextCode} 并拉取最新估值。`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "添加失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  async function onUpdateHoldingAmount(fundCode: string) {
    const input = (holdingEditMap.get(fundCode) ?? "").trim();
    const holdingAmount = input.length === 0 ? 0 : parseHoldingAmountInput(input);
    if (holdingAmount === undefined) {
      setErrorText("持仓金额格式不正确，请输入大于等于 0 的数字。");
      setStatusText("");
      return;
    }
    const currentHoldingAmount = Number(((fundMetaMap.get(fundCode) ?? EMPTY_META).holdingAmount ?? 0).toFixed(2));
    if (Math.abs(holdingAmount - currentHoldingAmount) < 0.0001) {
      onCloseHoldingEditor(fundCode);
      return;
    }

    setIsLoading(true);
    setErrorText("");
    setStatusText("");
    try {
      await updateWatchlistFundHoldingAmount(fundCode, holdingAmount);
      setFundMetaMap((prev) => {
        const next = new Map(prev);
        const current = next.get(fundCode) ?? EMPTY_META;
        next.set(fundCode, {
          ...current,
          holdingAmount
        });
        return next;
      });
      setHoldingEditMap((prev) => {
        const next = new Map(prev);
        next.delete(fundCode);
        return next;
      });
      setActiveHoldingEditorCode((prev) => (prev === fundCode ? null : prev));
      setStatusText(`已更新基金 ${fundCode} 持仓金额为 ¥${formatCurrency(holdingAmount)}。`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "更新持仓金额失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  function onHoldingInputChange(fundCode: string, value: string) {
    setHoldingEditMap((prev) => {
      const next = new Map(prev);
      next.set(fundCode, value);
      return next;
    });
  }

  function onOpenHoldingEditor(fundCode: string, holdingAmount: number) {
    setActiveHoldingEditorCode(fundCode);
    setHoldingEditMap((prev) => {
      if (prev.has(fundCode)) {
        return prev;
      }
      const next = new Map(prev);
      next.set(fundCode, holdingAmount.toFixed(2));
      return next;
    });
  }

  function onCloseHoldingEditor(fundCode: string) {
    setActiveHoldingEditorCode((prev) => (prev === fundCode ? null : prev));
    setHoldingEditMap((prev) => {
      const next = new Map(prev);
      next.delete(fundCode);
      return next;
    });
  }

  async function onDeleteFund(fundCode: string) {
    setIsLoading(true);
    setErrorText("");
    setStatusText("");

    try {
      await removeWatchlistFund(fundCode);
      const nextCodes = fundCodes.filter((code) => code !== fundCode);
      setFundCodes(nextCodes);
      setEstimateMap((prev) => {
        const next = new Map(prev);
        next.delete(fundCode);
        return next;
      });
      setFundMetaMap((prev) => {
        const next = new Map(prev);
        next.delete(fundCode);
        return next;
      });
      setHoldingEditMap((prev) => {
        const next = new Map(prev);
        next.delete(fundCode);
        return next;
      });
      setActiveHoldingEditorCode((prev) => (prev === fundCode ? null : prev));
      setPartialFailed((prev) => prev.filter((code) => code !== fundCode));
      setStatusText(`已删除基金 ${fundCode}。`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "删除失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!activeHoldingEditorCode || isLoading) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (target instanceof HTMLElement && target.closest('[data-skip-holding-auto-save="true"]')) {
        return;
      }

      if (activeHoldingEditorRef.current?.contains(target)) {
        return;
      }

      void onUpdateHoldingAmount(activeHoldingEditorCode);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [activeHoldingEditorCode, isLoading, onUpdateHoldingAmount]);

  function renderCardHeaderActions(fundCode: string) {
    return (
      <div className="card-head-actions">
        <button
          className="card-delete-btn"
          type="button"
          onClick={() => onDeleteFund(fundCode)}
          disabled={isLoading}
          data-skip-holding-auto-save="true"
          aria-label={`删除基金 ${fundCode}`}
        >
          移除
        </button>
      </div>
    );
  }

  function renderHoldingAmountField(fundCode: string, holdingAmount: number) {
    const isOpen = activeHoldingEditorCode === fundCode;
    const editHoldingValue = holdingEditMap.get(fundCode) ?? "";

    if (!isOpen) {
      return (
        <div className="holding-amount-row">
          <button className="holding-amount-trigger" type="button" onClick={() => onOpenHoldingEditor(fundCode, holdingAmount)} disabled={isLoading}>
            <span className="code">持仓金额:</span>
            <span className="holding-amount-hotspot">
              <span className="holding-amount-value">¥{formatCurrency(holdingAmount)}</span>
              <span className="holding-amount-edit-icon" aria-hidden>
                ✎
              </span>
            </span>
          </button>
        </div>
      );
    }

    return (
      <div className="holding-amount-row">
        <div
          className="holding-amount-editor-inline"
          ref={(node) => {
            activeHoldingEditorRef.current = node;
          }}
          data-holding-hotzone="true"
        >
          <label className="code" htmlFor={`holding-editor-${fundCode}`}>
            持仓金额:
          </label>
          <input
            id={`holding-editor-${fundCode}`}
            className="text-input holding-inline-input"
            type="text"
            inputMode="decimal"
            placeholder="输入金额"
            value={editHoldingValue}
            onChange={(event) => onHoldingInputChange(fundCode, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onUpdateHoldingAmount(fundCode);
              }
              if (event.key === "Escape") {
                onCloseHoldingEditor(fundCode);
              }
            }}
            disabled={isLoading}
            autoFocus
          />
          <span className="code">元</span>
        </div>
      </div>
    );
  }

  return (
    <main>
      <section className="header">
        <div>
          <h1 className="title">Digmo 盘中估值</h1>
          <p className="subtitle">关注基金已持久化到服务端数据库，列表仅展示你手动添加的基金。</p>
        </div>
        <span className="badge">MVP</span>
      </section>

      <section className="actions">
        <form className="add-fund-form" onSubmit={onAddFund}>
          <label htmlFor="fund-code-input" className="code">
            关注基金代码
          </label>
          <div className="control-row">
            <input
              id="fund-code-input"
              className="text-input"
              type="text"
              inputMode="numeric"
              placeholder="例如 161725"
              value={inputCode}
              onChange={(event) => setInputCode(event.target.value)}
              disabled={isLoading}
            />
            <input
              className="text-input"
              type="text"
              inputMode="decimal"
              placeholder="持仓金额(选填)，默认 0"
              value={inputHoldingAmount}
              onChange={(event) => setInputHoldingAmount(event.target.value)}
              disabled={isLoading}
            />
            <button className="btn-primary" type="submit" disabled={isLoading}>
              添加基金
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={onManualRefresh}
              disabled={isLoading || fundCodes.length === 0}
            >
              手动更新
            </button>
          </div>
        </form>
        <div className="mode-switch" role="group" aria-label="展示模式">
          <button
            className={`mode-btn ${displayMode === "detailed" ? "mode-btn-active" : ""}`}
            type="button"
            onClick={() => setDisplayMode("detailed")}
          >
            详细模式
          </button>
          <button
            className={`mode-btn ${displayMode === "compact" ? "mode-btn-active" : ""}`}
            type="button"
            onClick={() => setDisplayMode("compact")}
          >
            简洁模式
          </button>
        </div>
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

      <section className={displayMode === "compact" ? "grid grid-compact" : "grid"}>
        {snapshots.length === 0 ? (
          <article className="card">
            <header className="card-head">
              <div className="fund">暂无关注基金</div>
            </header>
            <p className="code">请先输入基金代码并添加，列表不会再展示示例基金。</p>
          </article>
        ) : null}

        {snapshots.map(({ fundCode, snapshot, meta }) => {
          const holdingAmount = meta.holdingAmount;
          const totalChangePct = meta.totalChangePct;
          const dayReturnText = snapshot ? formatDayReturn(holdingAmount, snapshot.estimateChangePct) : "- / -";
          const dayReturnClass = snapshot ? deltaClass(snapshot.estimateChangePct) : "code";
          const totalReturnText = `${formatSignedAmount(holdingAmount * totalChangePct)} / ${formatSignedRatioPct(totalChangePct)}`;

          if (!snapshot) {
            if (displayMode === "compact") {
              return (
                <article className="card card-compact" key={fundCode}>
                  <header className="card-head card-head-fixed">
                    <div className="card-head-main">
                      <div className="fund fund-name">基金 {fundCode}</div>
                      <div className="code">基金代码: {fundCode}</div>
                    </div>
                    {renderCardHeaderActions(fundCode)}
                  </header>
                  {renderHoldingAmountField(fundCode, holdingAmount)}
                  <p className={`${deltaClass(totalChangePct)} metric-total`}>总收益: {totalReturnText}</p>
                  <p className="code metric-day-amount">当日收益: - / -</p>
                </article>
              );
            }

            return (
              <article className="card" key={fundCode}>
                <header className="card-head card-head-fixed">
                  <div className="card-head-main">
                    <div className="fund fund-name">基金 {fundCode}</div>
                    <div className="code">基金代码: {fundCode}</div>
                  </div>
                  {renderCardHeaderActions(fundCode)}
                </header>
                {renderHoldingAmountField(fundCode, holdingAmount)}
                <p className={`${deltaClass(totalChangePct)} metric-total`}>总收益: {totalReturnText}</p>
                <p className="delta-down">当前未获取到估值数据，请点击“手动更新”重试。</p>
                <p className="code metric-day-amount">当日收益: - / -</p>
              </article>
            );
          }

          if (displayMode === "compact") {
            return (
              <article className="card card-compact" key={snapshot.fundCode}>
                <header className="card-head card-head-fixed">
                  <div className="card-head-main">
                    <div className="fund fund-name">{snapshot.fundName ?? `基金 ${snapshot.fundCode}`}</div>
                    <div className="code">基金代码: {snapshot.fundCode}</div>
                  </div>
                  {renderCardHeaderActions(snapshot.fundCode)}
                </header>
                {renderHoldingAmountField(snapshot.fundCode, holdingAmount)}
                <p className={`${deltaClass(totalChangePct)} metric-total`}>总收益: {totalReturnText}</p>
                <p className={`${dayReturnClass} metric-day-amount`}>当日收益: {dayReturnText}</p>
              </article>
            );
          }

          return (
            <article className="card" key={snapshot.fundCode}>
              <header className="card-head card-head-fixed">
                <div className="card-head-main">
                  <div className="fund fund-name">{snapshot.fundName ?? `基金 ${snapshot.fundCode}`}</div>
                  <div className="code">基金代码: {snapshot.fundCode}</div>
                </div>
                {renderCardHeaderActions(snapshot.fundCode)}
              </header>
              {renderHoldingAmountField(snapshot.fundCode, holdingAmount)}
              <p className="code">方法: {snapshot.method}</p>
              <p>官方最新单位净值: {(snapshot.officialNav ?? snapshot.estimateNav).toFixed(4)}</p>
              <p className={deltaClass(snapshot.officialDailyReturn ?? snapshot.estimateChangePct)}>
                官方日涨跌: {((snapshot.officialDailyReturn ?? snapshot.estimateChangePct) * 100).toFixed(2)}%
              </p>
              <p>盘中估值: {snapshot.estimateNav.toFixed(4)}</p>
              <p className={`${dayReturnClass} metric-day-amount`}>当日收益: {dayReturnText}</p>
              <p className={`${deltaClass(totalChangePct)} metric-total`}>总收益: {totalReturnText}</p>
              <p className="code">更新时间: {formatBeijingTime(snapshot.estimateTime)}</p>
              <p className="code">输入延迟: {snapshot.inputsStalenessSec}s</p>
              <p className="code">持仓报告期: {snapshot.holdingReportDate ?? "暂无"}</p>
              <p className="code">
                前五持仓:{" "}
                {(snapshot.topHoldings ?? []).length > 0
                  ? (snapshot.topHoldings ?? [])
                      .map((holding) => {
                        const marketPart =
                          holding.marketCap || holding.floatMarketCap
                            ? `, 总市值${formatMarketCap(holding.marketCap)}, 流通${formatMarketCap(holding.floatMarketCap)}`
                            : "";
                        const quotePart =
                          typeof holding.latestPrice === "number"
                            ? `, 价${holding.latestPrice.toFixed(2)}, 涨跌${((holding.changePct ?? 0) * 100).toFixed(2)}%`
                            : "";
                        return `${holding.name}(${(holding.ratio * 100).toFixed(2)}%${quotePart}${marketPart})`;
                      })
                      .join(" / ")
                  : "暂无"}
              </p>
              <p className="code">{snapshot.disclaimer}</p>
              <p className="card-actions">
                <Link href={`/funds/${snapshot.fundCode}`}>查看详情</Link>
              </p>
            </article>
          );
        })}
      </section>

      {fundCodes.length > 0 ? <footer className="footer">批量失败: {partialFailed.join(", ") || "无"}</footer> : null}
    </main>
  );
}

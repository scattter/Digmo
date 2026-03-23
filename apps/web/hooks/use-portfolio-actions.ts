"use client";

import { PortfolioFundItem, PortfolioSummary, PortfolioType, PositionOperationType } from "@digmo/shared";
import {
  addPortfolioFund,
  createPositionOperation,
  createPortfolio,
  deletePortfolio,
  importPortfolioByShareCode,
  removePortfolioFund,
  renamePortfolio,
  sharePortfolio,
  updatePortfolioFund
} from "@/lib/api";
import { ImportPortfolioByShareCodeResult, PortfolioShareResult } from "@digmo/shared";
import { parseNonNegativeNumber, parseRatioPercent, parseSignedNumber } from "@/lib/format";

interface UsePortfolioActionsArgs {
  refreshData: (options?: { silent?: boolean }) => Promise<void>;
  selectedPortfolioId: string;
  setSelectedPortfolioId: (value: string) => void;
  setIsLoading: (value: boolean) => void;
  setErrorText: (value: string) => void;
  setStatusText: (value: string) => void;
}

export function usePortfolioActions(args: UsePortfolioActionsArgs) {
  const { refreshData, selectedPortfolioId, setSelectedPortfolioId, setIsLoading, setErrorText, setStatusText } = args;

  async function createPortfolioAction(name: string, type: PortfolioType) {
    setIsLoading(true);
    setErrorText("");
    setStatusText("");
    try {
      await createPortfolio(name.trim(), type);
      await refreshData();
      const message = `已创建组合: ${name.trim()}`;
      setStatusText(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建组合失败";
      setErrorText(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function renamePortfolioAction(portfolio: PortfolioSummary, nextName: string) {
    setIsLoading(true);
    setErrorText("");
    setStatusText("");
    try {
      await renamePortfolio(portfolio.id, nextName.trim());
      await refreshData();
      const message = `已重命名组合为 ${nextName.trim()}`;
      setStatusText(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "重命名失败";
      setErrorText(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function deletePortfolioAction(portfolio: PortfolioSummary) {
    setIsLoading(true);
    setErrorText("");
    setStatusText("");
    try {
      await deletePortfolio(portfolio.id);
      if (selectedPortfolioId === portfolio.id) {
        setSelectedPortfolioId("all");
      }
      await refreshData();
      const message = `已删除组合 ${portfolio.name}`;
      setStatusText(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除组合失败";
      setErrorText(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function addFundAction(input: {
    portfolioId: string;
    portfolioType: PortfolioType;
    fundCode: string;
    holdingAmount: string;
    holdingProfitAmount?: string;
    plannedRatio: string;
  }) {
    const fundCode = input.fundCode.trim();
    if (!/^\d{6}$/.test(fundCode)) {
      const message = "基金代码格式不正确，请输入 6 位数字";
      setErrorText(message);
      throw new Error(message);
    }

    const holdingAmount = parseNonNegativeNumber(input.holdingAmount);
    if (holdingAmount === undefined) {
      const message = "持仓金额格式错误，请输入大于等于 0 的数字";
      setErrorText(message);
      throw new Error(message);
    }

    let plannedRatio: number | undefined;
    if (input.portfolioType === "RATIO") {
      plannedRatio = parseRatioPercent(input.plannedRatio);
      if (plannedRatio === undefined) {
        const message = "按比例组合请填写 0-100 的计划比例";
        setErrorText(message);
        throw new Error(message);
      }
    }

    const holdingProfitRaw = input.holdingProfitAmount?.trim() ?? "";
    const holdingProfitAmount = holdingProfitRaw ? parseSignedNumber(holdingProfitRaw) : undefined;
    if (holdingProfitRaw && holdingProfitAmount === undefined) {
      const message = "持有收益金额格式错误";
      setErrorText(message);
      throw new Error(message);
    }

    setIsLoading(true);
    setErrorText("");
    setStatusText("");
    try {
      await addPortfolioFund({
        portfolioId: input.portfolioId,
        fundCode,
        holdingAmount,
        holdingProfitAmount,
        plannedRatio
      });
      await refreshData({ silent: true });
      const message = `已添加基金 ${fundCode}`;
      setStatusText(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "添加基金失败";
      setErrorText(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function updateFundAction(
    item: PortfolioFundItem,
    holdingAmountRaw: string,
    plannedRatioRaw: string,
    holdingProfitAmountRaw: string
  ) {
    const holdingAmount = parseNonNegativeNumber(holdingAmountRaw);
    if (holdingAmount === undefined) {
      const message = "持仓金额格式错误";
      setErrorText(message);
      throw new Error(message);
    }

    let plannedRatio: number | undefined;
    if (item.portfolioType === "RATIO") {
      plannedRatio = parseRatioPercent(plannedRatioRaw);
      if (plannedRatio === undefined) {
        const message = "计划比例格式错误，请输入 0-100";
        setErrorText(message);
        throw new Error(message);
      }
    }

    const holdingProfitAmount = parseSignedNumber(holdingProfitAmountRaw);
    if (holdingProfitAmount === undefined) {
      const message = "持有收益金额格式错误";
      setErrorText(message);
      throw new Error(message);
    }

    setIsLoading(true);
    setErrorText("");
    setStatusText("");

    try {
      await updatePortfolioFund({
        portfolioId: item.portfolioId,
        fundCode: item.fundCode,
        holdingAmount,
        holdingProfitAmount,
        plannedRatio
      });
      await refreshData();
      const message = `已更新基金 ${item.fundCode}`;
      setStatusText(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新基金失败";
      setErrorText(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteFundAction(item: PortfolioFundItem) {
    setIsLoading(true);
    setErrorText("");
    setStatusText("");
    try {
      await removePortfolioFund(item.portfolioId, item.fundCode);
      await refreshData();
      const message = `已移除基金 ${item.fundCode}`;
      setStatusText(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "移除基金失败";
      setErrorText(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function manualRefreshAction(markManualRefresh: () => void) {
    setIsLoading(true);
    setErrorText("");
    setStatusText("");
    try {
      await refreshData();
      markManualRefresh();
      const message = "已手动更新全部数据。";
      setStatusText(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "手动更新失败";
      setErrorText(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function operatePositionAction(
    item: PortfolioFundItem,
    operationType: PositionOperationType,
    amountRaw: string
  ) {
    const amount = parseNonNegativeNumber(amountRaw);
    if (amount === undefined || amount <= 0) {
      const message = "操作金额格式错误，请输入大于 0 的数字";
      setErrorText(message);
      throw new Error(message);
    }

    setIsLoading(true);
    setErrorText("");
    setStatusText("");

    try {
      await createPositionOperation({
        portfolioId: item.portfolioId,
        fundCode: item.fundCode,
        operationType,
        amount
      });
      await refreshData();
      const actionText = operationType === "INCREASE" ? "加仓" : "减仓";
      const message = `已${actionText}基金 ${item.fundCode}`;
      setStatusText(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "仓位操作失败";
      setErrorText(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function sharePortfolioAction(input: {
    portfolioId: string;
    validity?: "SEVEN_DAYS" | "PERMANENT";
    password?: string;
  }): Promise<PortfolioShareResult> {
    setIsLoading(true);
    setErrorText("");
    setStatusText("");
    try {
      const result = await sharePortfolio({
        portfolioId: input.portfolioId,
        validity: input.validity ?? "SEVEN_DAYS",
        password: input.password,
      });
      setStatusText("组合分享码已生成");
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成分享码失败";
      setErrorText(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function importPortfolioByShareCodeAction(input: {
    shareCode: string;
    password?: string;
  }): Promise<ImportPortfolioByShareCodeResult> {
    setIsLoading(true);
    setErrorText("");
    setStatusText("");
    try {
      const result = await importPortfolioByShareCode({
        shareCode: input.shareCode,
        password: input.password,
      });
      await refreshData();
      setStatusText(`已导入组合 ${result.portfolio.name}`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入组合失败";
      setErrorText(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  return {
    createPortfolioAction,
    renamePortfolioAction,
    deletePortfolioAction,
    addFundAction,
    updateFundAction,
    deleteFundAction,
    manualRefreshAction,
    operatePositionAction,
    sharePortfolioAction,
    importPortfolioByShareCodeAction
  };
}

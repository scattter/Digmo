"use client";

import { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { PortfolioFundItem } from "@digmo/shared";
import { toast } from "sonner";
import { reorderPortfolioFunds } from "@/lib/api";

interface UseFundReorderArgs {
  selectedPortfolioId: string;
  portfolioFunds: PortfolioFundItem[];
  setPortfolioFunds: (value: PortfolioFundItem[]) => void;
  setIsReordering: (value: boolean) => void;
  setErrorText: (value: string) => void;
  setStatusText: (value: string) => void;
}

export function useFundReorder(args: UseFundReorderArgs) {
  const {
    selectedPortfolioId,
    portfolioFunds,
    setPortfolioFunds,
    setIsReordering,
    setErrorText,
    setStatusText
  } = args;

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
      const message = "已更新组合基金顺序。";
      setStatusText(message);
      toast.success(message);
    } catch (error) {
      setPortfolioFunds(previous);
      const message = error instanceof Error ? error.message : "基金重排序失败";
      setErrorText(message);
      toast.error(message);
    } finally {
      setIsReordering(false);
    }
  }

  function onPortfolioFundsDragEnd(event: DragEndEvent, isReordering: boolean) {
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

  function movePortfolioFundByStep(fundCode: string, step: -1 | 1, isReordering: boolean) {
    if (selectedPortfolioId === "all" || isReordering) {
      return;
    }

    const oldIndex = portfolioFunds.findIndex((item) => item.fundCode === fundCode);
    if (oldIndex < 0) {
      return;
    }

    const newIndex = oldIndex + step;
    if (newIndex < 0 || newIndex >= portfolioFunds.length) {
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

  return {
    onPortfolioFundsDragEnd,
    movePortfolioFundByStep
  };
}

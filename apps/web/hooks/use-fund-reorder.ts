"use client";

import { Dispatch, SetStateAction, useEffect, useRef } from "react";
import { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { PortfolioFundItem } from "@digmo/shared";
import { reorderPortfolioFunds } from "@/lib/api";

interface UseFundReorderArgs {
  selectedPortfolioId: string;
  portfolioFunds: PortfolioFundItem[];
  setPortfolioFunds: Dispatch<SetStateAction<PortfolioFundItem[]>>;
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

  const pending = useRef(false);
  const mounted = useRef(true);
  const selection = useRef({ id: selectedPortfolioId, version: 0 });
  if (selection.current.id !== selectedPortfolioId) {
    selection.current = { id: selectedPortfolioId, version: selection.current.version + 1 };
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function persistPortfolioFundOrder(previous: PortfolioFundItem[], next: PortfolioFundItem[]) {
    if (selectedPortfolioId === "all") {
      return;
    }

    pending.current = true;
    const version = selection.current.version;
    const isCurrent = () => mounted.current && selection.current.id === selectedPortfolioId && selection.current.version === version;
    setIsReordering(true);
    setErrorText("");
    setStatusText("");

    try {
      await reorderPortfolioFunds(
        selectedPortfolioId,
        next.map((item) => item.fundCode)
      );
      const message = "已更新组合基金顺序。";
      if (isCurrent()) setStatusText(message);
    } catch (error) {
      if (isCurrent()) {
        // 只撤销本次乐观更新，避免覆盖排序期间刷新得到的新持仓。
        setPortfolioFunds((current) => current === next ? previous : current);
        const message = error instanceof Error ? error.message : "基金重排序失败";
        setErrorText(message);
      }
    } finally {
      pending.current = false;
      if (mounted.current) setIsReordering(false);
    }
  }

  function onPortfolioFundsDragEnd(event: DragEndEvent, isReordering: boolean) {
    if (selectedPortfolioId === "all" || isReordering || pending.current) {
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
    if (selectedPortfolioId === "all" || isReordering || pending.current) {
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

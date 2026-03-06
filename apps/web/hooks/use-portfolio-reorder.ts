"use client";

import { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { PortfolioSummary } from "@digmo/shared";
import { toast } from "sonner";
import { reorderPortfolios } from "@/lib/api";

interface UsePortfolioReorderArgs {
  portfolios: PortfolioSummary[];
  setPortfolios: (value: PortfolioSummary[]) => void;
  setIsReordering: (value: boolean) => void;
  setErrorText: (value: string) => void;
  setStatusText: (value: string) => void;
}

export function usePortfolioReorder(args: UsePortfolioReorderArgs) {
  const { portfolios, setPortfolios, setIsReordering, setErrorText, setStatusText } = args;

  async function persistPortfolioOrder(previous: PortfolioSummary[], next: PortfolioSummary[]) {
    setIsReordering(true);
    setErrorText("");
    setStatusText("");

    try {
      await reorderPortfolios(next.map((item) => item.id));
      const message = "已更新组合顺序。";
      setStatusText(message);
      toast.success(message);
    } catch (error) {
      setPortfolios(previous);
      const message = error instanceof Error ? error.message : "组合排序失败";
      setErrorText(message);
      toast.error(message);
    } finally {
      setIsReordering(false);
    }
  }

  function onPortfolioTabsDragEnd(event: DragEndEvent, isReordering: boolean) {
    if (isReordering) {
      return;
    }

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = portfolios.findIndex((item) => item.id === String(active.id));
    const newIndex = portfolios.findIndex((item) => item.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const previous = portfolios;
    const reordered = arrayMove(portfolios, oldIndex, newIndex);
    setPortfolios(reordered);
    void persistPortfolioOrder(previous, reordered);
  }

  return {
    onPortfolioTabsDragEnd
  };
}

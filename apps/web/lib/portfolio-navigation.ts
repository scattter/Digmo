import type { Modifier } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";

export const TAB_DRAG_MODIFIERS: Modifier[] = [restrictToHorizontalAxis];

interface NextActiveTabInput {
  activeTabId: string;
  deletedPortfolioId: string;
  portfolioIds: string[];
}

export function getNextActiveTabAfterPortfolioDelete({
  activeTabId,
  deletedPortfolioId,
  portfolioIds,
}: NextActiveTabInput): string {
  if (activeTabId !== deletedPortfolioId) {
    return activeTabId;
  }

  const deletedIndex = portfolioIds.indexOf(deletedPortfolioId);
  if (deletedIndex < 0) {
    return "summary";
  }

  return (
    portfolioIds[deletedIndex - 1] ??
    portfolioIds[deletedIndex + 1] ??
    "summary"
  );
}

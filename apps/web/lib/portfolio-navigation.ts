import type { Modifier } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";

export const TAB_DRAG_MODIFIERS: Modifier[] = [restrictToHorizontalAxis];

interface NextActiveTabInput {
  activeTabId: string;
  deletedPortfolioId: string;
  portfolioIds: string[];
}

interface SelectedPortfolioFromActiveTabInput {
  activeTabId: string;
  portfolioIds: string[];
}

export function getNextActiveTabAfterPortfolioDelete({
  activeTabId,
  deletedPortfolioId,
}: NextActiveTabInput): string {
  if (activeTabId !== deletedPortfolioId) {
    return activeTabId;
  }

  return "summary";
}

export function getSelectedPortfolioIdFromActiveTab({
  activeTabId,
  portfolioIds,
}: SelectedPortfolioFromActiveTabInput): string | undefined {
  if (activeTabId === "summary" || activeTabId === "funds") {
    return undefined;
  }

  return portfolioIds.includes(activeTabId) ? activeTabId : undefined;
}

import { describe, expect, it } from "vitest";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";

import {
  getNextActiveTabAfterPortfolioDelete,
  getSelectedPortfolioIdFromActiveTab,
  TAB_DRAG_MODIFIERS,
} from "./portfolio-navigation";

describe("getNextActiveTabAfterPortfolioDelete", () => {
  it("keeps the active tab when another portfolio is deleted", () => {
    expect(
      getNextActiveTabAfterPortfolioDelete({
        activeTabId: "portfolio-3",
        deletedPortfolioId: "portfolio-2",
        portfolioIds: ["portfolio-1", "portfolio-2", "portfolio-3"],
      }),
    ).toBe("portfolio-3");
  });

  it("falls back to summary when deleting the active portfolio", () => {
    expect(
      getNextActiveTabAfterPortfolioDelete({
        activeTabId: "portfolio-2",
        deletedPortfolioId: "portfolio-2",
        portfolioIds: ["portfolio-1", "portfolio-2", "portfolio-3"],
      }),
    ).toBe("summary");
  });

  it("falls back to summary when deleting the last portfolio", () => {
    expect(
      getNextActiveTabAfterPortfolioDelete({
        activeTabId: "portfolio-1",
        deletedPortfolioId: "portfolio-1",
        portfolioIds: ["portfolio-1"],
      }),
    ).toBe("summary");
  });
});

describe("TAB_DRAG_MODIFIERS", () => {
  it("locks tab dragging to the horizontal axis", () => {
    expect(TAB_DRAG_MODIFIERS).toEqual([restrictToHorizontalAxis]);
  });
});

describe("getSelectedPortfolioIdFromActiveTab", () => {
  it("returns the active portfolio id when the tab still exists", () => {
    expect(
      getSelectedPortfolioIdFromActiveTab({
        activeTabId: "portfolio-2",
        portfolioIds: ["portfolio-1", "portfolio-2", "portfolio-3"],
      }),
    ).toBe("portfolio-2");
  });

  it("returns undefined for summary and funds tabs", () => {
    expect(
      getSelectedPortfolioIdFromActiveTab({
        activeTabId: "summary",
        portfolioIds: ["portfolio-1"],
      }),
    ).toBeUndefined();

    expect(
      getSelectedPortfolioIdFromActiveTab({
        activeTabId: "funds",
        portfolioIds: ["portfolio-1"],
      }),
    ).toBeUndefined();
  });

  it("returns undefined when the active tab points to a deleted portfolio", () => {
    expect(
      getSelectedPortfolioIdFromActiveTab({
        activeTabId: "portfolio-2",
        portfolioIds: ["portfolio-1", "portfolio-3"],
      }),
    ).toBeUndefined();
  });
});

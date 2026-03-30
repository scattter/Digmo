import { describe, expect, it, vi, beforeEach } from "vitest";

import type { PortfolioSummary } from "@digmo/shared";

import { usePortfolioActions } from "./use-portfolio-actions";

const { deletePortfolioMock } = vi.hoisted(() => ({
  deletePortfolioMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  addPortfolioFund: vi.fn(),
  createPositionOperation: vi.fn(),
  createPortfolio: vi.fn(),
  deletePortfolio: deletePortfolioMock,
  importPortfolioByShareCode: vi.fn(),
  removePortfolioFund: vi.fn(),
  renamePortfolio: vi.fn(),
  sharePortfolio: vi.fn(),
  updatePortfolioFund: vi.fn(),
}));

describe("usePortfolioActions.deletePortfolioAction", () => {
  beforeEach(() => {
    deletePortfolioMock.mockReset();
  });

  it("clears the selected portfolio and refreshes against the summary view when deleting the active portfolio", async () => {
    deletePortfolioMock.mockResolvedValue(undefined);

    const refreshData = vi.fn().mockResolvedValue(undefined);
    const setSelectedPortfolioId = vi.fn();
    const actions = usePortfolioActions({
      refreshData,
      selectedPortfolioId: "portfolio-1",
      setSelectedPortfolioId,
      setIsLoading: vi.fn(),
      setErrorText: vi.fn(),
      setStatusText: vi.fn(),
    });

    const portfolio: PortfolioSummary = {
      id: "portfolio-1",
      name: "稳健组合",
      type: "FREE",
      fundCount: 0,
      totalAmount: 0,
      totalProfitAmount: 0,
      totalProfitPct: 0,
      totalProfitDisplay: "0.00%",
      dailyProfitPct: 0,
      allFundsDailyUpdated: false,
    };

    await actions.deletePortfolioAction(portfolio);

    expect(setSelectedPortfolioId).toHaveBeenCalledWith("all");
    expect(refreshData).toHaveBeenCalledWith({ selectedPortfolioId: "all" });
  });
});

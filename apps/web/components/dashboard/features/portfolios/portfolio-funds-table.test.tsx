import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioFundItem } from "@digmo/shared";

import { PortfolioFundsTable } from "./portfolio-funds-table";

afterEach(() => {
  cleanup();
});

function buildFund(overrides: Partial<PortfolioFundItem>): PortfolioFundItem {
  return {
    portfolioId: "portfolio-1",
    portfolioName: "稳健组合",
    portfolioType: "RATIO",
    fundCode: "000001",
    displayOrder: 0,
    fundName: "示例基金",
    holdingAmount: 1000,
    estimateChangePct: 0.01,
    totalChangePct: 0.02,
    intradayAmount: 10,
    totalProfitAmount: 50,
    holdingProfitAmount: 50,
    holdingProfitPct: 0.05,
    dailyProfitAmount: 10,
    dailyProfitPct: 0.01,
    dailyProfitOfficialUpdated: false,
    trend: "UP",
    plannedRatio: 0.5,
    actualRatio: 0.5,
    ...overrides,
  };
}

function renderTable({
  portfolioType = "RATIO" as const,
  funds = [],
  portfolioCashAmount,
  portfolioCashRatio,
}: {
  portfolioType?: "FREE" | "RATIO";
  funds?: PortfolioFundItem[];
  portfolioCashAmount?: number;
  portfolioCashRatio?: number;
} = {}) {
  return render(
    <PortfolioFundsTable
      portfolioName="稳健组合"
      portfolioType={portfolioType}
      portfolioCashAmount={portfolioCashAmount}
      portfolioCashRatio={portfolioCashRatio}
      funds={funds}
      editStateMap={new Map()}
      isBusy={false}
      isLoading={false}
      onEditFieldChange={vi.fn()}
      onUpdateFund={vi.fn()}
      onOperateFund={vi.fn()}
      onDeleteFund={vi.fn()}
      onDragEnd={vi.fn()}
      onOpenAddFundDialog={vi.fn()}
      onOpenShareDialog={vi.fn()}
      onDeletePortfolio={vi.fn()}
    />,
  );
}

describe("PortfolioFundsTable", () => {
  it("shows a delete action in the header menu and calls onDeletePortfolio", async () => {
    const onDeletePortfolio = vi.fn();

    render(
      <PortfolioFundsTable
        portfolioName="稳健组合"
        portfolioType="FREE"
        funds={[]}
        editStateMap={new Map()}
        isBusy={false}
        isLoading={false}
        onEditFieldChange={vi.fn()}
        onUpdateFund={vi.fn()}
        onOperateFund={vi.fn()}
        onDeleteFund={vi.fn()}
        onDragEnd={vi.fn()}
        onOpenAddFundDialog={vi.fn()}
        onOpenShareDialog={vi.fn()}
        onDeletePortfolio={onDeletePortfolio}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "组合更多操作" }));

    const deleteItem = await screen.findByText("删除组合");
    fireEvent.click(deleteItem);

    expect(onDeletePortfolio).toHaveBeenCalledTimes(1);
  });

  it("shows cash summary and a virtual cash row for ratio portfolios with remaining allocation", () => {
    renderTable({
      portfolioType: "RATIO",
      portfolioCashAmount: 2000,
      portfolioCashRatio: 0.4,
      funds: [
        buildFund({ fundCode: "000001", fundName: "基金A", plannedRatio: 0.4, actualRatio: 0.6 }),
        buildFund({ fundCode: "000002", fundName: "基金B", plannedRatio: 0.3, actualRatio: 0.4, holdingAmount: 800 }),
      ],
    });

    expect(screen.getByText("已配置 70.00% · 现金/待配置 30.00%")).toBeInTheDocument();
    expect(screen.getByText("现金 / 待配置")).toBeInTheDocument();
    expect(screen.getByText("按比例组合剩余仓位")).toBeInTheDocument();

    const cashRow = screen.getByText("现金 / 待配置").closest("tr");
    expect(cashRow).not.toBeNull();
    expect(within(cashRow as HTMLElement).getByText("40.0%/30.0%")).toBeInTheDocument();
    expect(within(cashRow as HTMLElement).getByText("¥2,000.00")).toBeInTheDocument();
    expect(within(cashRow as HTMLElement).queryByRole("button")).toBeNull();
  });

  it("shows fully allocated summary without a virtual cash row when ratio targets sum to 100%", () => {
    renderTable({
      portfolioType: "RATIO",
      funds: [
        buildFund({ fundCode: "000001", fundName: "基金A", plannedRatio: 0.4, actualRatio: 0.5 }),
        buildFund({ fundCode: "000002", fundName: "基金B", plannedRatio: 0.6, actualRatio: 0.5, holdingAmount: 800 }),
      ],
    });

    expect(screen.getByText("已配置 100.00% · 已满配")).toBeInTheDocument();
    expect(screen.queryByText("现金 / 待配置")).not.toBeInTheDocument();
  });

  it("does not show cash summary or virtual row for free portfolios", () => {
    renderTable({
      portfolioType: "FREE",
      funds: [
        buildFund({
          portfolioType: "FREE",
          fundCode: "000001",
          fundName: "基金A",
          plannedRatio: undefined,
          actualRatio: undefined,
        }),
      ],
    });

    expect(screen.queryByText(/现金\/待配置/)).not.toBeInTheDocument();
    expect(screen.queryByText(/已配置/)).not.toBeInTheDocument();
  });
});

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PortfolioFundsTable } from "./portfolio-funds-table";

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
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PortfolioSummary } from "@digmo/shared";
import { PortfolioSummaryCard } from "./portfolio-summary-card";

const portfolio: PortfolioSummary = {
  id: "portfolio-1",
  name: "收益组合",
  type: "FREE",
  fundCount: 1,
  totalAmount: 10000,
  totalProfitAmount: 0,
  totalProfitPct: 0,
  totalProfitDisplay: "0.00 / 0.00%",
  allFundsDailyUpdated: false,
  intradayEstimatePct: 0.01,
};

afterEach(cleanup);

describe("PortfolioSummaryCard daily profit", () => {
  it.each([
    { amount: 100, rate: 0.01, text: "+100.00" },
    { amount: -100, rate: -0.01, text: "-100.00" },
  ])("shows the server amount $amount", ({ amount, rate, text }) => {
    render(<PortfolioSummaryCard portfolio={{ ...portfolio, dailyProfitAmount: amount, dailyProfitPct: rate }} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText("+99.01")).not.toBeInTheDocument();
  });

  it("keeps missing daily profit unknown even when an estimate is present", () => {
    render(<PortfolioSummaryCard portfolio={portfolio} />);
    expect(screen.getAllByText("-")).toHaveLength(2);
    expect(screen.queryByText("+100.00")).not.toBeInTheDocument();
    expect(screen.queryByText("+1.00%")).not.toBeInTheDocument();
  });
});

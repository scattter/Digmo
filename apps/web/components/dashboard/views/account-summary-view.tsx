"use client";

import { PortfolioSummary } from "@digmo/shared";
import { PortfolioSummaryCard } from "../cards/portfolio-summary-card";
import { Empty } from "antd";

interface AccountSummaryViewProps {
  portfolios: PortfolioSummary[];
  onSelectPortfolio: (id: string) => void;
}

export function AccountSummaryView({ portfolios, onSelectPortfolio }: AccountSummaryViewProps) {
  if (portfolios.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <Empty description="暂无组合，请先创建" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {portfolios.map((portfolio) => (
        <PortfolioSummaryCard
          key={portfolio.id}
          portfolio={portfolio}
          onClick={() => onSelectPortfolio(portfolio.id)}
        />
      ))}
    </div>
  );
}

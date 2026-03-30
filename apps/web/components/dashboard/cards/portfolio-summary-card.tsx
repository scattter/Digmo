"use client";

import { PortfolioSummary } from "@digmo/shared";
import { FolderOpenOutlined, ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import { formatCurrency, formatSignedAmount, formatSignedPct } from "@/lib/format";

interface PortfolioSummaryCardProps {
  portfolio: PortfolioSummary;
  onClick?: () => void;
}

export function PortfolioSummaryCard({ portfolio, onClick }: PortfolioSummaryCardProps) {
  const displayTotalAsset = portfolio.totalAsset ?? portfolio.totalAmount;
  // Helpers for styling
  const getTrendColor = (val: number | undefined) => {
    if (typeof val !== "number") return "text-gray-500";
    if (val > 0) return "text-red-500";
    if (val < 0) return "text-green-500";
    return "text-gray-500";
  };

  const getTrendBgBadge = (val: number | undefined) => {
    const base = "text-xs px-1 py-0.5 rounded ml-1";
    if (typeof val !== "number") return `${base} bg-gray-50 text-gray-500`;
    if (val > 0) return `${base} bg-red-50 text-red-500`;
    if (val < 0) return `${base} bg-green-50 text-green-500`;
    return `${base} bg-gray-50 text-gray-500`;
  };

  // Calculate daily profit amount (approximate) based on intradayEstimatePct
  // Profit = Current - (Current / (1 + rate))
  const dailyProfitAmount =
    typeof portfolio.intradayEstimatePct === "number"
      ? portfolio.totalAmount - (portfolio.totalAmount / (1 + portfolio.intradayEstimatePct))
      : undefined;

  return (
    <div 
      className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <div className="bg-blue-50 p-1.5 rounded-md">
            <FolderOpenOutlined className="text-blue-500 text-base" />
          </div>
          <span className="font-medium text-gray-900 text-sm">{portfolio.name}</span>
          {/* Badge? Optional */}
        </div>
        
        {/* Up/Down Counts - Placeholder as we don't have this data in PortfolioSummary yet */}
        {/* 
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center text-red-500">
            <ArrowUpOutlined className="mr-0.5" />
            <span>5</span>
          </div>
          <div className="flex items-center text-green-500">
            <ArrowDownOutlined className="mr-0.5" />
            <span>4</span>
          </div>
        </div>
        */}
      </div>

      {/* Body */}
      <div className="p-4 grid grid-cols-2 gap-4">
        {/* Left Column */}
        <div className="flex flex-col gap-4">
          {/* Account Assets */}
          <div>
            <div className="text-gray-500 text-xs mb-1">账户资产</div>
            <div className="text-xl font-bold text-gray-900 leading-none">
              {formatCurrency(displayTotalAsset)}
            </div>
          </div>

          {/* Holding Profit */}
          <div>
            <div className="text-gray-500 text-xs mb-1">持有收益</div>
            <div className="flex items-baseline flex-wrap gap-1">
              <span className={`text-base font-medium ${getTrendColor(portfolio.totalProfitAmount)}`}>
                {formatSignedAmount(portfolio.totalProfitAmount)}
              </span>
              <span className={getTrendBgBadge(portfolio.totalProfitPct)}>
                {formatSignedPct(portfolio.totalProfitPct)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-4">
          {/* Chart Placeholder */}
          <div className="flex-1 min-h-[40px] flex items-center justify-center">
            {/* Chart Area */}
          </div>

          {/* Daily Profit */}
          <div>
            <div className="text-gray-500 text-xs mb-1">当日收益</div>
            <div className="flex items-baseline flex-wrap gap-1">
              <span className={`text-base font-medium ${getTrendColor(dailyProfitAmount)}`}>
                {formatSignedAmount(dailyProfitAmount)}
              </span>
              <span className={getTrendBgBadge(portfolio.intradayEstimatePct)}>
                {formatSignedPct(portfolio.intradayEstimatePct)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

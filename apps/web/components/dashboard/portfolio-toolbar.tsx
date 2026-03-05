"use client";

import { PortfolioSummary } from "@digmo/shared";
import { X } from "lucide-react";
import { FlatExpandMode, SortOrder } from "@/lib/api";
import { MainView } from "@/hooks/use-dashboard-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PortfolioToolbarProps {
  mainView: MainView;
  isBusy: boolean;
  portfolios: PortfolioSummary[];
  selectedPortfolioId: string;
  onSelectPortfolio: (portfolioId: string) => void;
  flatExpand: FlatExpandMode;
  onFlatExpandChange: (value: FlatExpandMode) => void;
  flatSortOrder: SortOrder;
  onFlatSortToggle: () => void;
  flatSortLabel: string;
  onDeletePortfolioTab: (portfolio: PortfolioSummary) => void;
}

export function PortfolioToolbar(props: PortfolioToolbarProps) {
  const {
    mainView,
    isBusy,
    portfolios,
    selectedPortfolioId,
    onSelectPortfolio,
    flatExpand,
    onFlatExpandChange,
    flatSortOrder,
    onFlatSortToggle,
    flatSortLabel,
    onDeletePortfolioTab
  } = props;

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        {mainView === "portfolios" ? (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="组合选择">
            <Button
              type="button"
              variant={selectedPortfolioId === "all" ? "default" : "secondary"}
              onClick={() => onSelectPortfolio("all")}
            >
              全部组合
            </Button>
            {portfolios.map((portfolio) => (
              <div key={portfolio.id} className="group relative inline-flex items-center">
                <Button
                  type="button"
                  variant={selectedPortfolioId === portfolio.id ? "default" : "secondary"}
                  className="pr-5"
                  onClick={() => onSelectPortfolio(portfolio.id)}
                >
                  {portfolio.name}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute -right-2 -top-2 z-10 h-11 w-11 rounded-full bg-transparent p-0 opacity-100 hover:bg-transparent focus-visible:bg-transparent active:bg-transparent md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                  aria-label={`删除组合 ${portfolio.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeletePortfolioTab(portfolio);
                  }}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-sm">
                    <X className="h-3 w-3" />
                  </span>
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {mainView === "funds" ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2" role="group" aria-label="平铺展开模式">
              <Button
                type="button"
                variant={flatExpand === "dedup" ? "default" : "secondary"}
                onClick={() => onFlatExpandChange("dedup")}
              >
                去重汇总
              </Button>
              <Button
                type="button"
                variant={flatExpand === "expanded" ? "default" : "secondary"}
                onClick={() => onFlatExpandChange("expanded")}
              >
                按组合展开
              </Button>
            </div>

            <Button
              type="button"
              variant={flatSortOrder === "default" ? "secondary" : "default"}
              onClick={onFlatSortToggle}
              className="md:min-w-[140px]"
            >
              {flatSortLabel}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

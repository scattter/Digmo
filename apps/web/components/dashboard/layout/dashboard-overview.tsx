"use client";

import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Plus,
  LayoutGrid,
} from "lucide-react";
import { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatSignedAmountCompact, deltaClassByPct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DashboardOverviewProps {
  totalAmount: number;
  totalIntradayAmount: number;
  onAddFund: () => void;
  onCreatePortfolio: () => void;
  children?: ReactNode;
}

export function DashboardOverview({
  totalAmount,
  totalIntradayAmount,
  onAddFund,
  onCreatePortfolio,
  children,
}: DashboardOverviewProps) {
  const isProfit = totalIntradayAmount > 0;
  const isLoss = totalIntradayAmount < 0;

  return (
    <div className="space-y-6">
      {/* Hero Stats Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="relative overflow-hidden border-none bg-gradient-to-br from-primary/10 to-primary/5 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总资产净值</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">
              {formatCurrency(totalAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              更新于 刚刚
            </p>
          </CardContent>
          <div className="absolute -right-6 -bottom-6 opacity-5">
            <TrendingUp size={120} />
          </div>
        </Card>

        <Card className={cn(
          "relative overflow-hidden border-none shadow-md",
          isProfit ? "bg-red-50 dark:bg-red-950/20" : isLoss ? "bg-green-50 dark:bg-green-950/20" : "bg-muted"
        )}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">今日估算盈亏</CardTitle>
            {isProfit ? (
              <ArrowUpRight className="h-4 w-4 text-red-600" />
            ) : isLoss ? (
              <ArrowDownRight className="h-4 w-4 text-green-600" />
            ) : null}
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-3xl font-bold tracking-tight font-mono",
              deltaClassByPct(totalIntradayAmount)
            )}>
              {formatSignedAmountCompact(totalIntradayAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              盘中实时估算
            </p>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-center border-dashed bg-muted/20">
          <CardContent className="flex gap-4 p-6 pt-6">
            <Button className="flex-1 h-12 shadow-sm" onClick={onAddFund}>
              <Plus className="mr-2 h-4 w-4" />
              添加基金
            </Button>
            <Button variant="outline" className="flex-1 h-12 bg-background" onClick={onCreatePortfolio}>
              <LayoutGrid className="mr-2 h-4 w-4" />
              新建组合
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Main Content (Children) */}
      <div className="space-y-6">
        {children}
      </div>
    </div>
  );
}

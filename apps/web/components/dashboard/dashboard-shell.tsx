"use client";

import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { deltaClassByPct, formatCurrency, formatSignedAmountCompact } from "@/lib/format";

interface DashboardShellProps {
  children: ReactNode;
  totalAmount: number;
  totalIntradayAmount: number;
}

export function DashboardShell({ children, totalAmount, totalIntradayAmount }: DashboardShellProps) {
  return (
    <main id="main-content" className="mx-auto w-full max-w-7xl px-4 pb-14 pt-6 md:px-6">
      <header className="mb-6 flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight md:text-xl">Digmo 组合与基金视图</h1>
            <Badge variant="secondary">Portfolio MVP</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">支持基金平铺与组合管理，组合总收益采用金额/比例统一展示。</p>
        </div>

        <div className="flex min-h-[44px] flex-wrap items-center gap-4 rounded-lg border border-border px-3 py-2 md:gap-6">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">基金总额</p>
            <p className="font-mono text-sm text-foreground">{formatCurrency(totalAmount)}</p>
          </div>
          <div className="space-y-0.5 md:text-right">
            <p className="text-xs text-muted-foreground">今日预估收益</p>
            <p className={`font-mono text-sm ${deltaClassByPct(totalIntradayAmount)}`}>
              {formatSignedAmountCompact(totalIntradayAmount)}
            </p>
          </div>
        </div>
      </header>

      {children}
    </main>
  );
}

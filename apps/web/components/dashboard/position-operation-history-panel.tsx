"use client";

import { PositionOperationRecord } from "@digmo/shared";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBeijingTime, formatCurrency } from "@/lib/format";

interface PositionOperationHistoryPanelProps {
  operations: PositionOperationRecord[];
  isLoading: boolean;
  onRefresh: () => Promise<void>;
  isBusy: boolean;
}

function operationLabel(type: PositionOperationRecord["operationType"]): string {
  return type === "INCREASE" ? "加仓" : "减仓";
}

export function PositionOperationHistoryPanel({
  operations,
  isLoading,
  onRefresh,
  isBusy
}: PositionOperationHistoryPanelProps) {
  const [fundCodeFilter, setFundCodeFilter] = useState("all");

  const fundCodes = useMemo(
    () => Array.from(new Set(operations.map((item) => item.fundCode))).sort((a, b) => a.localeCompare(b)),
    [operations]
  );

  const rows = useMemo(() => {
    if (fundCodeFilter === "all") {
      return operations;
    }
    return operations.filter((item) => item.fundCode === fundCodeFilter);
  }, [fundCodeFilter, operations]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={fundCodeFilter}
            onChange={(event) => setFundCodeFilter(event.target.value)}
          >
            <option value="all">全部基金</option>
            {fundCodes.map((fundCode) => (
              <option key={fundCode} value={fundCode}>
                {fundCode}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => void onRefresh()} disabled={isBusy}>
          刷新历史
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          {isLoading ? "加载中..." : "暂无操作记录"}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((item) => (
            <div key={item.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.operationType === "INCREASE" ? "default" : "secondary"}>{operationLabel(item.operationType)}</Badge>
                <span className="font-mono text-sm">{item.fundCode}</span>
                <span className="text-xs text-muted-foreground">{formatBeijingTime(item.createdAt)}</span>
              </div>

              <p className="text-sm">
                变动金额: ¥{formatCurrency(item.amount)} · 持仓: ¥{formatCurrency(item.beforeHoldingAmount)} → ¥
                {formatCurrency(item.afterHoldingAmount)}
              </p>
              <p className="text-sm text-muted-foreground">
                持有收益: ¥{formatCurrency(item.beforeHoldingProfitAmount)} → ¥{formatCurrency(item.afterHoldingProfitAmount)}
              </p>

              {item.bindSuggestion ? (
                <div className="rounded border border-border/70 bg-muted/30 p-2 text-xs">
                  <p className="font-medium">
                    绑定建议 #{item.bindSuggestion.actionOrder + 1} · {item.bindSuggestion.actionType}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {item.bindSuggestion.fundCode}
                    {item.bindSuggestion.fundName ? ` (${item.bindSuggestion.fundName})` : ""} · 风险 {item.bindSuggestion.riskLevel}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-muted-foreground">{item.bindSuggestion.rationale}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">未绑定今日建议</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

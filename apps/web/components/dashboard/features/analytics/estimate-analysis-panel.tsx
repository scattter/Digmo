import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SortOrder } from "@/lib/api";
import { deltaClassByPct, formatSignedCurrency, formatSignedPct } from "@/lib/format";
import { getEstimateSortButtonLabel } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

interface EstimateAnalysisRow {
  fundCode: string;
  fundName: string;
  estimateChangePct: number;
  intradayAmount: number;
}

interface EstimateAnalysisPanelProps {
  rows: EstimateAnalysisRow[];
  sortOrder: SortOrder;
  onToggleSort: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  disabled: boolean;
  compact?: boolean;
  className?: string;
}

export function EstimateAnalysisPanel({
  rows,
  sortOrder,
  onToggleSort,
  expanded,
  onToggleExpanded,
  disabled,
  compact = false,
  className
}: EstimateAnalysisPanelProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">今日预估</CardTitle>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onToggleExpanded} disabled={disabled}>
            {expanded ? "收起" : "展开"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onToggleSort} disabled={disabled || !expanded}>
            <ArrowUpDown className="h-4 w-4" />
            {getEstimateSortButtonLabel(sortOrder)}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        {rows.length === 0 ? <p className="text-xs text-muted-foreground">当前组合暂无基金数据。</p> : null}

        {rows.length > 0 && !expanded ? <p className="text-xs text-muted-foreground">已收起，点击“展开”查看今日预估。</p> : null}

        {rows.length > 0 && expanded ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            <div className={compact ? "space-y-1.5" : "space-y-2"}>
              {rows.map((row) => (
                <div key={row.fundCode} className={`flex items-center justify-between rounded-md border border-border ${compact ? "p-2.5" : "p-3"}`}>
                  <div>
                    <p className="text-sm font-medium">{row.fundName}</p>
                    {!compact ? <p className="text-xs font-mono text-muted-foreground">{row.fundCode}</p> : null}
                  </div>
                  <p className={`font-mono text-sm ${deltaClassByPct(row.estimateChangePct)}`}>
                    {formatSignedCurrency(row.intradayAmount)}/{formatSignedPct(row.estimateChangePct)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

import { ArrowUpDown } from "lucide-react";
import { SortOrder } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getEstimateSortButtonLabel } from "@/hooks/use-dashboard-data";
import { deltaClassByPct, formatPct, formatSignedAmountCompact, formatSignedPct } from "@/lib/format";

interface RatioAnalysisRow {
  fundCode: string;
  fundName: string;
  plannedRatio: number;
  actualRatio: number;
  estimateChangePct: number;
  intradayAmount: number;
  overByMoreThan15Pct: boolean;
}

interface RatioAnalysisPanelProps {
  rows: RatioAnalysisRow[];
  sortOrder: SortOrder;
  onToggleSort: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  disabled: boolean;
}

export function RatioAnalysisPanel({
  rows,
  sortOrder,
  onToggleSort,
  expanded,
  onToggleExpanded,
  disabled
}: RatioAnalysisPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">比例达成</CardTitle>
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
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">当前组合暂无可分析的比例数据。</p>
        ) : null}

        {rows.length > 0 && !expanded ? <p className="text-xs text-muted-foreground">已收起，点击“展开”查看达成详情。</p> : null}

        {rows.length > 0 && expanded ? (
          <div className="grid grid-cols-1 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {rows.map((row) => {
              const overrun = Math.max(0, row.actualRatio - row.plannedRatio);
              const actualWidth = row.plannedRatio > 0 ? Math.min((row.actualRatio / row.plannedRatio) * 100, 100) : row.actualRatio > 0 ? 100 : 0;

              return (
                <div key={row.fundCode} className="rounded-md border border-border p-3">
                  <div className="mb-2 space-y-1">
                    <p className="truncate text-sm font-medium" title={row.fundName}>
                      {row.fundName}
                    </p>
                    <p className={`inline-flex items-center gap-1 text-xs font-mono ${deltaClassByPct(row.estimateChangePct)}`}>
                      <span>{formatSignedAmountCompact(row.intradayAmount)}</span>
                      <span>({formatSignedPct(row.estimateChangePct)})</span>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>计划 {formatPct(row.plannedRatio)}</span>
                      <span>实际 {formatPct(row.actualRatio)}</span>
                    </div>

                    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="absolute inset-y-0 left-0 w-full rounded-full bg-primary/30" />
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full ${overrun > 0 ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${actualWidth}%` }}
                      />
                    </div>

                    {overrun > 0 ? <p className="text-xs font-mono text-warning">+{(overrun * 100).toFixed(2)}%</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

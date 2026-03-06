import { PortfolioType } from "@digmo/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deltaClassByPct, formatBeijingTime, formatSignedAmountCompact, formatSignedPct } from "@/lib/format";

export interface DailyProfitCompareRow {
  portfolioId: string;
  portfolioName: string;
  portfolioType: PortfolioType;
  v1DailyProfitPct: number;
  v2DailyProfitPct: number;
  v1DailyProfitAmount: number;
  v2DailyProfitAmount: number;
  diffPct: number;
  diffAmount: number;
  missingFundCount: number;
}

interface DailyProfitComparePanelProps {
  rows: DailyProfitCompareRow[];
  isLoading: boolean;
  generatedAt?: string;
  tradeDate?: string;
  source?: string;
}

export function DailyProfitComparePanel({ rows, isLoading, generatedAt, tradeDate, source }: DailyProfitComparePanelProps) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">当日收益对比（V1 vs V2）</CardTitle>
        <p className="text-xs text-muted-foreground">
          V1 使用现有 `/v1` 口径，V2 使用新 `/v2` 口径；用于每日交易时段观察差异。
          {tradeDate ? ` 交易日: ${tradeDate}` : ""}
          {generatedAt ? ` · V2 更新时间: ${formatBeijingTime(generatedAt)}` : ""}
          {source ? ` · 来源: ${source}` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : null}

        {!isLoading && rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            暂无组合数据，无法计算 V1/V2 差异。
          </div>
        ) : null}

        {!isLoading && rows.length > 0 ? (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader className="[&_tr]:bg-muted/60">
                  <TableRow className="hover:bg-muted/60">
                    <TableHead>组合</TableHead>
                    <TableHead className="text-right">V1 当日收益</TableHead>
                    <TableHead className="text-right">V2 当日收益</TableHead>
                    <TableHead className="text-right">差值(%)</TableHead>
                    <TableHead className="text-right">差值(¥)</TableHead>
                    <TableHead className="text-right">V2 缺失基金</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr:nth-child(even)]:bg-muted/20">
                  {rows.map((row) => (
                    <TableRow key={row.portfolioId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{row.portfolioName}</span>
                          <Badge variant="secondary">{row.portfolioType === "FREE" ? "自由" : "按比例"}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-mono ${deltaClassByPct(row.v1DailyProfitPct)}`}>
                        {formatSignedPct(row.v1DailyProfitPct)} / {formatSignedAmountCompact(row.v1DailyProfitAmount)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${deltaClassByPct(row.v2DailyProfitPct)}`}>
                        {formatSignedPct(row.v2DailyProfitPct)} / {formatSignedAmountCompact(row.v2DailyProfitAmount)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${deltaClassByPct(row.diffPct)}`}>
                        {formatSignedPct(row.diffPct)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${deltaClassByPct(row.diffAmount)}`}>
                        {formatSignedAmountCompact(row.diffAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.missingFundCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 md:hidden">
              {rows.map((row) => (
                <Card key={row.portfolioId}>
                  <CardContent className="space-y-2 pt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{row.portfolioName}</span>
                      <Badge variant="secondary">{row.portfolioType === "FREE" ? "自由" : "按比例"}</Badge>
                    </div>
                    <p className={`text-xs ${deltaClassByPct(row.v1DailyProfitPct)}`}>
                      V1: {formatSignedPct(row.v1DailyProfitPct)} / {formatSignedAmountCompact(row.v1DailyProfitAmount)}
                    </p>
                    <p className={`text-xs ${deltaClassByPct(row.v2DailyProfitPct)}`}>
                      V2: {formatSignedPct(row.v2DailyProfitPct)} / {formatSignedAmountCompact(row.v2DailyProfitAmount)}
                    </p>
                    <p className={`text-xs ${deltaClassByPct(row.diffPct)}`}>差值(%): {formatSignedPct(row.diffPct)}</p>
                    <p className={`text-xs ${deltaClassByPct(row.diffAmount)}`}>
                      差值(¥): {formatSignedAmountCompact(row.diffAmount)}
                    </p>
                    <p className="text-xs text-muted-foreground">V2 缺失基金: {row.missingFundCount}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

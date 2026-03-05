import { FlatFundItem } from "@digmo/shared";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FlatExpandMode } from "@/lib/api";
import { formatCurrency, formatSignedPct, trendTone } from "@/lib/format";

interface FlatFundsTableProps {
  data: FlatFundItem[];
  expand: FlatExpandMode;
  isLoading: boolean;
  isBusy: boolean;
  onRefresh: () => Promise<void>;
}

export function FlatFundsTable({ data, expand, isLoading, isBusy, onRefresh }: FlatFundsTableProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">基金平铺</CardTitle>
        <Button type="button" variant="secondary" size="sm" onClick={() => void onRefresh()} disabled={isBusy}>
          <RefreshCw className="h-4 w-4" />
          手动更新
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : null}

        {!isLoading && data.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">暂无基金数据，请先创建组合并添加基金。</div>
        ) : null}

        {!isLoading && data.length > 0 ? (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>基金</TableHead>
                    <TableHead>代码</TableHead>
                    <TableHead className="text-right">持仓金额</TableHead>
                    <TableHead className="text-right">历史总涨跌</TableHead>
                    <TableHead className="text-right">盘中估算</TableHead>
                    <TableHead>所属组合</TableHead>
                    <TableHead className="text-right">详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item) => (
                    <TableRow key={`${item.fundCode}-${item.portfolioId ?? "all"}`}>
                      <TableCell className="font-medium">{item.fundName ?? `基金 ${item.fundCode}`}</TableCell>
                      <TableCell className="font-mono">{item.fundCode}</TableCell>
                      <TableCell className="text-right font-mono">¥{formatCurrency(item.holdingAmount)}</TableCell>
                      <TableCell className="text-right font-mono">{formatSignedPct(item.totalChangePct)}</TableCell>
                      <TableCell className="text-right font-mono">
                        <Badge variant={trendTone(item.trend)}>{formatSignedPct(item.estimateChangePct)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {expand === "dedup"
                          ? `(${item.portfolioCount}) ${item.portfolioNames.join(" / ") || "-"}`
                          : item.portfolioName ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="link" size="sm" asChild>
                          <Link href={`/funds/${item.fundCode}`}>查看详情</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 md:hidden">
              {data.map((item) => (
                <Card key={`${item.fundCode}-${item.portfolioId ?? "all"}`}>
                  <CardContent className="space-y-2 pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{item.fundName ?? `基金 ${item.fundCode}`}</p>
                      <Badge variant={trendTone(item.trend)}>{formatSignedPct(item.estimateChangePct)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">代码: {item.fundCode}</p>
                    <p className="text-sm text-muted-foreground">持仓金额: ¥{formatCurrency(item.holdingAmount)}</p>
                    <p className="text-sm text-muted-foreground">历史总涨跌: {formatSignedPct(item.totalChangePct)}</p>
                    <Button variant="link" size="sm" className="px-0" asChild>
                      <Link href={`/funds/${item.fundCode}`}>查看详情</Link>
                    </Button>
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

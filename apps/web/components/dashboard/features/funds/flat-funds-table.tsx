import { FlatFundItem } from "@digmo/shared";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FlatExpandMode } from "@/lib/api";
import { formatCurrency, formatSignedPct, trendTone } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FlatFundsTableProps {
  data: FlatFundItem[];
  expand: FlatExpandMode;
  isLoading: boolean;
  isBusy: boolean;
  onRefresh: () => Promise<void>;
}

function FundsTable({
  data,
  showPortfolioColumn = false,
}: {
  data: FlatFundItem[];
  showPortfolioColumn?: boolean;
}) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px] min-w-[180px] sticky left-0 z-20 bg-background">
              基金名称
            </TableHead>
            <TableHead className="w-[120px] min-w-[120px] text-right sticky left-[180px] z-20 bg-background">
              持仓金额
            </TableHead>
            <TableHead className="text-right">历史总涨跌</TableHead>
            <TableHead className="text-right">盘中估算</TableHead>
            {showPortfolioColumn && <TableHead>所属组合</TableHead>}
            <TableHead className="text-right sticky right-0 z-20 bg-background">
              详情
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, index) => {
            const stickyBg = index % 2 !== 0 ? "bg-muted/50" : "bg-background";
            return (
              <TableRow
                key={`${item.fundCode}-${item.portfolioId ?? "all"}`}
                className="even:bg-muted/50"
              >
                <TableCell
                  className={cn(
                    "w-[180px] min-w-[180px] sticky left-0 z-10 transition-colors",
                    stickyBg
                  )}
                >
                  <div className="flex flex-col">
                    <span
                      className="font-medium truncate max-w-[180px]"
                      title={item.fundName ?? ""}
                    >
                      {item.fundName ?? `基金 ${item.fundCode}`}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {item.fundCode}
                    </span>
                  </div>
                </TableCell>
                <TableCell
                  className={cn(
                    "w-[120px] min-w-[120px] text-right font-mono sticky left-[180px] z-10 transition-colors",
                    stickyBg
                  )}
                >
                  ¥{formatCurrency(item.holdingAmount)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatSignedPct(item.totalChangePct)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  <Badge variant={trendTone(item.trend)}>
                    {formatSignedPct(item.estimateChangePct)}
                  </Badge>
                </TableCell>
                {showPortfolioColumn && (
                  <TableCell className="text-sm text-muted-foreground">
                    {item.portfolioCount && item.portfolioCount > 1
                      ? `(${item.portfolioCount}) ${
                          item.portfolioNames.join(" / ") || "-"
                        }`
                      : item.portfolioName ?? "-"}
                  </TableCell>
                )}
                <TableCell
                  className={cn(
                    "text-right sticky right-0 z-10 transition-colors",
                    stickyBg
                  )}
                >
                  <Button variant="link" size="sm" asChild>
                    <Link href={`/funds/${item.fundCode}`}>查看详情</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function FlatFundsTable({
  data,
  expand,
  isLoading,
  isBusy,
  onRefresh,
}: FlatFundsTableProps) {
  // Group by Portfolio logic
  const groupedData =
    expand === "dedup"
      ? null
      : data.reduce((acc, item) => {
          const key = item.portfolioId ?? "other";
          const name = item.portfolioName ?? "其他";
          if (!acc[key]) {
            acc[key] = { name, items: [] };
          }
          acc[key].items.push(item);
          return acc;
        }, {} as Record<string, { name: string; items: FlatFundItem[] }>);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>基金平铺</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">基金平铺</CardTitle>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void onRefresh()}
            disabled={isBusy}
          >
            <RefreshCw className="h-4 w-4" />
            手动更新
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            暂无基金数据，请先创建组合并添加基金。
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderMobileList = (items: FlatFundItem[]) => (
    <div className="grid gap-3 md:hidden">
      {items.map((item) => (
        <Card key={`${item.fundCode}-${item.portfolioId ?? "all"}`}>
          <CardContent className="space-y-2 pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">
                {item.fundName ?? `基金 ${item.fundCode}`}
              </p>
              <Badge variant={trendTone(item.trend)}>
                {formatSignedPct(item.estimateChangePct)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              代码: {item.fundCode}
            </p>
            <p className="text-sm text-muted-foreground">
              持仓金额: ¥{formatCurrency(item.holdingAmount)}
            </p>
            <p className="text-sm text-muted-foreground">
              历史总涨跌: {formatSignedPct(item.totalChangePct)}
            </p>
            <Button variant="link" size="sm" className="px-0" asChild>
              <Link href={`/funds/${item.fundCode}`}>查看详情</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {expand === "dedup" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">所有基金 (去重)</CardTitle>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void onRefresh()}
              disabled={isBusy}
            >
              <RefreshCw className="h-4 w-4" />
              手动更新
            </Button>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <FundsTable data={data} showPortfolioColumn={true} />
            </div>
            {renderMobileList(data)}
          </CardContent>
        </Card>
      ) : (
        <>
           <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onRefresh()}
                disabled={isBusy}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                手动更新
              </Button>
           </div>
          {groupedData &&
            Object.entries(groupedData).map(([key, group]) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="text-base">{group.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="hidden md:block">
                    <FundsTable data={group.items} showPortfolioColumn={false} />
                  </div>
                  {renderMobileList(group.items)}
                </CardContent>
              </Card>
            ))}
        </>
      )}
    </div>
  );
}

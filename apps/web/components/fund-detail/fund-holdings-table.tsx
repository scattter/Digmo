import { FundEstimateSnapshot } from "@digmo/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface FundHoldingsTableProps {
  snapshot: FundEstimateSnapshot;
}

function formatMarketCap(value?: number): string {
  if (typeof value !== "number") {
    return "-";
  }
  return `${(value / 100000000).toFixed(2)}亿`;
}

export function FundHoldingsTable({ snapshot }: FundHoldingsTableProps) {
  const holdings = snapshot.topHoldings ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">前五持仓</CardTitle>
      </CardHeader>
      <CardContent>
        {holdings.length === 0 ? <p className="text-sm text-muted-foreground">暂无持仓数据</p> : null}

        {holdings.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead className="text-right">占比</TableHead>
                <TableHead className="text-right">最新价</TableHead>
                <TableHead className="text-right">涨跌</TableHead>
                <TableHead className="text-right">总市值</TableHead>
                <TableHead className="text-right">流通市值</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((holding) => (
                <TableRow key={holding.code}>
                  <TableCell>{holding.name}</TableCell>
                  <TableCell className="text-right font-mono">{(holding.ratio * 100).toFixed(2)}%</TableCell>
                  <TableCell className="text-right font-mono">
                    {typeof holding.latestPrice === "number" ? holding.latestPrice.toFixed(2) : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {typeof holding.changePct === "number" ? `${(holding.changePct * 100).toFixed(2)}%` : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatMarketCap(holding.marketCap)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMarketCap(holding.floatMarketCap)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}

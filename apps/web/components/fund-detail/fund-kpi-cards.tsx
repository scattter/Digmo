import { FundEstimateSnapshot } from "@digmo/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FundKpiCardsProps {
  snapshot: FundEstimateSnapshot;
}

function fmt(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function FundKpiCards({ snapshot }: FundKpiCardsProps) {
  const items = [
    {
      label: "盘中估值",
      value: fmt(snapshot.estimateNav, 4)
    },
    {
      label: "当日涨幅",
      value: `${fmt(snapshot.estimateChangePct * 100)}%`
    },
    {
      label: "官方最新单位净值",
      value: fmt(snapshot.officialNav ?? snapshot.estimateNav, 4)
    },
    {
      label: "官方日涨跌",
      value: `${fmt((snapshot.officialDailyReturn ?? snapshot.estimateChangePct) * 100)}%`
    }
  ];

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xl font-semibold">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

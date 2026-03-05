import { FundEstimateSnapshot } from "@digmo/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FundMethodConfidenceProps {
  snapshot: FundEstimateSnapshot;
}

export function FundMethodConfidence({ snapshot }: FundMethodConfidenceProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">方法与置信度</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm text-muted-foreground">
        <p>
          置信度: <Badge variant="secondary">{snapshot.confidenceLevel}</Badge> （{snapshot.confidenceScore}）
        </p>
        <p>估值方法: {snapshot.method}</p>
        <p>输入延迟: {snapshot.inputsStalenessSec}s</p>
        <p>基准净值日期: {snapshot.baseNavDate}</p>
        <p>持仓报告期: {snapshot.holdingReportDate ?? "暂无"}</p>
      </CardContent>
    </Card>
  );
}

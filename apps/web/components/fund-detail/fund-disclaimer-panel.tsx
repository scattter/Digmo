import { FundEstimateSnapshot } from "@digmo/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FundDisclaimerPanelProps {
  snapshot: FundEstimateSnapshot;
}

export function FundDisclaimerPanel({ snapshot }: FundDisclaimerPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">风险与免责声明</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>{snapshot.disclaimer}</p>
      </CardContent>
    </Card>
  );
}

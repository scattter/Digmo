import { FundEstimateSnapshot } from "@digmo/shared";
import { Card, Typography } from "antd";

const { Paragraph } = Typography;

interface FundDisclaimerPanelProps {
  snapshot: FundEstimateSnapshot;
}

export function FundDisclaimerPanel({ snapshot }: FundDisclaimerPanelProps) {
  return (
    <Card title="风险与免责声明">
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        {snapshot.disclaimer}
      </Paragraph>
    </Card>
  );
}

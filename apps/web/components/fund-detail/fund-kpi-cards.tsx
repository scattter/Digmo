import { FundEstimateSnapshot } from "@digmo/shared";
import { Card, Statistic, Row, Col } from "antd";

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
    <Row gutter={[12, 12]}>
      {items.map((item) => (
        <Col xs={24} md={12} xl={6} key={item.label}>
          <Card variant="borderless">
            <Statistic
              title={item.label}
              value={item.value}
              valueStyle={{ fontFamily: 'monospace', fontWeight: 600 }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

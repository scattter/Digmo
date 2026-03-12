import { FundEstimateSnapshot } from "@digmo/shared";
import { Card, Tag, Descriptions } from "antd";

interface FundMethodConfidenceProps {
  snapshot: FundEstimateSnapshot;
}

export function FundMethodConfidence({ snapshot }: FundMethodConfidenceProps) {
  return (
    <Card title="方法与置信度">
      <Descriptions column={1} size="small">
        <Descriptions.Item label="置信度">
           <Tag>{snapshot.confidenceLevel}</Tag> ({snapshot.confidenceScore})
        </Descriptions.Item>
        <Descriptions.Item label="估值方法">{snapshot.method}</Descriptions.Item>
        <Descriptions.Item label="输入延迟">{snapshot.inputsStalenessSec}s</Descriptions.Item>
        <Descriptions.Item label="基准净值日期">{snapshot.baseNavDate}</Descriptions.Item>
        <Descriptions.Item label="持仓报告期">{snapshot.holdingReportDate ?? "暂无"}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

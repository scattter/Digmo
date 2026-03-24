"use client";

import {
  DecisionActionType,
  DecisionCitation,
  DecisionRiskLevel,
} from "@digmo/shared";
import { Card, Tag, Typography, Space } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import { formatBeijingTime, formatPct } from "@/lib/format";

const { Text, Paragraph } = Typography;

interface DecisionCardAction {
  actionType: DecisionActionType;
  fundCode: string;
  fundName?: string;
  riskLevel: DecisionRiskLevel;
  confidence: number;
  rationale: string;
  triggerCondition: string;
  validUntil: string;
  citations: DecisionCitation[];
}

interface DecisionCardProps {
  action: DecisionCardAction;
}

export function DecisionCard({ action }: DecisionCardProps) {
  return (
    <Card size="small" type="inner" variant={'borderless'} className="min-w-[300px] max-w-[400px]">
      <Space wrap style={{ marginBottom: 8 }}>
        <Tag color="blue">{action.actionType}</Tag>
        <Text code>{action.fundCode}</Text>
        {action.fundName && <Text>{action.fundName}</Text>}
        <Tag>{action.riskLevel}</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          置信度 {formatPct(action.confidence)}
        </Text>
      </Space>

      <Paragraph style={{ whiteSpace: "pre-line", marginBottom: 8 }}>
        {action.rationale}
      </Paragraph>

      <div style={{ marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          触发条件：{action.triggerCondition} · 失效时间：
          {formatBeijingTime(action.validUntil)}
        </Text>
      </div>

      {action.citations.length > 0 && (
        <div style={{ background: "#f5f5f5", padding: 8, borderRadius: 4 }}>
          <Text
            type="secondary"
            style={{ fontSize: 12, display: "block", marginBottom: 4 }}
          >
            来源依据
          </Text>
          {action.citations.map((citation: DecisionCitation, cIndex: number) => (
            <div
              key={cIndex}
              style={{
                marginBottom: 4,
                paddingBottom: 4,
                borderBottom: "1px solid #e8e8e8",
              }}
            >
              <Text strong style={{ fontSize: 12 }}>
                {citation.title}
              </Text>
              <Paragraph
                ellipsis={{ rows: 2, expandable: true, symbol: "展开" }}
                style={{
                  fontSize: 12,
                  color: "rgba(0,0,0,0.45)",
                  marginBottom: 4,
                }}
              >
                {citation.snippet}
              </Paragraph>
              <Space size="small">
                <Tag style={{ fontSize: 10 }}>{citation.sourceType}</Tag>
                {citation.url && (
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12 }}
                  >
                    <LinkOutlined /> 来源链接
                  </a>
                )}
              </Space>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

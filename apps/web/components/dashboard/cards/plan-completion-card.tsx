"use client";

import { Card, Progress, Typography } from "antd";
import { deltaClassByPct, formatPct, formatSignedAmountCompact, formatSignedPct } from "@/lib/format";

const { Text } = Typography;

export interface PlanCompletionCardProps {
  fundCode: string;
  fundName: string;
  plannedRatio: number;
  actualRatio: number;
  estimateChangePct: number;
  intradayAmount: number;
}

export function PlanCompletionCard({
  fundCode,
  fundName,
  plannedRatio,
  actualRatio,
  estimateChangePct,
  intradayAmount,
}: PlanCompletionCardProps) {
  const overrun = Math.max(0, actualRatio - plannedRatio);
  const percent =
    plannedRatio > 0
      ? Math.min((actualRatio / plannedRatio) * 100, 100)
      : actualRatio > 0
      ? 100
      : 0;

  return (
    <Card size="small" type="inner" bordered className="min-w-[240px]">
      <div style={{ marginBottom: 8 }}>
        <Text strong ellipsis={{ tooltip: fundName }} style={{ display: "block" }}>
          {fundName}
        </Text>
        <div
          className={deltaClassByPct(estimateChangePct)}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        >
          <span>{formatSignedAmountCompact(intradayAmount)}</span>
          <span>({formatSignedPct(estimateChangePct)})</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "rgba(0,0,0,0.45)",
          marginBottom: 4,
        }}
      >
        <span>计划 {formatPct(plannedRatio)}</span>
        <span>实际 {formatPct(actualRatio)}</span>
      </div>

      <Progress
        percent={percent}
        showInfo={false}
        status={overrun > 0 ? "exception" : "success"}
        size="small"
      />

      {overrun > 0 && (
        <div style={{ marginTop: 4, textAlign: "right" }}>
          <Text
            type="warning"
            style={{ fontSize: 12, fontFamily: "monospace" }}
          >
            +{(overrun * 100).toFixed(2)}%
          </Text>
        </div>
      )}
    </Card>
  );
}

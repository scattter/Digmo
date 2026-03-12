"use client";

import {
  PlusOutlined,
  AppstoreAddOutlined,
  FundOutlined,
  RiseOutlined,
  FallOutlined
} from "@ant-design/icons";
import { ReactNode } from "react";

import { Button, Card, Col, Row, Typography } from "antd";
import { deltaClassByPct, formatCurrency, formatSignedPct } from "@/lib/format";

const { Text } = Typography;

interface DashboardOverviewProps {
  totalAmount: number;
  totalProfitAmount: number;
  totalProfitPct: number;
  totalIntradayAmount: number;
  totalIntradayPct: number;
  isLoading: boolean;
  onAddFund: () => void;
  onCreatePortfolio: () => void;
  children?: ReactNode;
}

export function DashboardOverview({
  totalAmount,
  totalProfitAmount,
  totalProfitPct,
  totalIntradayAmount,
  totalIntradayPct,
  isLoading,
  onAddFund,
  onCreatePortfolio,
  children,
}: DashboardOverviewProps) {
  const intradayProfit = totalIntradayAmount > 0;
  const intradayLoss = totalIntradayAmount < 0;
  const intradayToneClass = deltaClassByPct(totalIntradayPct);
  const totalProfitToneClass = deltaClassByPct(totalProfitPct);

  const formatSignedCurrency = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}¥${formatCurrency(Math.abs(value))}`;
  };

  return (
    <div className="space-y-4">
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <Card
            bordered={false}
            style={{
              background: "linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)",
              filter: isLoading ? "grayscale(0.95)" : "none",
              opacity: isLoading ? 0.7 : 1,
            }}
            styles={{ body: { padding: 14 } }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FundOutlined />
              <Text strong>总资产净值</Text>
            </div>
            <Text strong style={{ display: "block", marginTop: 4, fontSize: 24, lineHeight: 1.25 }}>
              ¥{formatCurrency(totalAmount)}
            </Text>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                总收益
              </Text>
              <Text className={totalProfitToneClass} style={{ fontSize: 13, fontWeight: 500 }}>
                {formatSignedCurrency(totalProfitAmount)}
              </Text>
              <Text className={totalProfitToneClass} style={{ fontSize: 13 }}>
                {formatSignedPct(totalProfitPct)}
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card
            bordered={false}
            style={{
              background: intradayProfit ? "#fff1f0" : intradayLoss ? "#f6ffed" : "#f5f5f5",
              filter: isLoading ? "grayscale(0.95)" : "none",
              opacity: isLoading ? 0.7 : 1,
            }}
            styles={{ body: { padding: 14 } }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {intradayProfit ? (
                <RiseOutlined style={{ color: "#cf1322" }} />
              ) : intradayLoss ? (
                <FallOutlined style={{ color: "#389e0d" }} />
              ) : null}
              <Text strong>今日收益</Text>
            </div>
            <Text className={intradayToneClass} strong style={{ display: "block", marginTop: 4, fontSize: 24, lineHeight: 1.25 }}>
              {formatSignedCurrency(totalIntradayAmount)}
            </Text>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                盘中实时估算
              </Text>
              <Text className={intradayToneClass} style={{ fontSize: 13, fontWeight: 500 }}>
                {formatSignedPct(totalIntradayPct)}
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={onAddFund}
            disabled={isLoading}
            block
            style={{ height: 34 }}
          >
            添加基金
          </Button>
        </Col>
        <Col xs={24} md={12}>
          <Button
            icon={<AppstoreAddOutlined />}
            onClick={onCreatePortfolio}
            disabled={isLoading}
            block
            style={{ height: 34 }}
          >
            新建组合
          </Button>
        </Col>
      </Row>

      <div className="space-y-6">
        {children}
      </div>
    </div>
  );
}

"use client";

import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  PlusOutlined,
  AppstoreAddOutlined,
  FundOutlined,
  RiseOutlined,
  FallOutlined
} from "@ant-design/icons";
import { ReactNode } from "react";

import { Button, Card, Col, Row, Statistic, Typography } from "antd";
import { formatCurrency, formatSignedAmountCompact, deltaClassByPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const { Text } = Typography;

interface DashboardOverviewProps {
  totalAmount: number;
  totalIntradayAmount: number;
  onAddFund: () => void;
  onCreatePortfolio: () => void;
  children?: ReactNode;
}

export function DashboardOverview({
  totalAmount,
  totalIntradayAmount,
  onAddFund,
  onCreatePortfolio,
  children,
}: DashboardOverviewProps) {
  const isProfit = totalIntradayAmount > 0;
  const isLoss = totalIntradayAmount < 0;

  return (
    <div className="space-y-6">
      {/* Hero Stats Section */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} lg={8}>
          <Card bordered={false} style={{ background: 'linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)' }}>
            <Statistic
              title={<Text strong>总资产净值</Text>}
              value={totalAmount}
              precision={2}
              formatter={(value) => formatCurrency(Number(value))}
              prefix={<FundOutlined />}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>更新于 刚刚</Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={12} lg={8}>
          <Card bordered={false} style={{ background: isProfit ? '#fff1f0' : isLoss ? '#f6ffed' : '#f5f5f5' }}>
            <Statistic
              title={<Text strong>今日估算盈亏</Text>}
              value={totalIntradayAmount}
              precision={2}
              formatter={(value) => (
                <span className={deltaClassByPct(Number(value))}>
                  {formatSignedAmountCompact(Number(value))}
                </span>
              )}
              prefix={isProfit ? <RiseOutlined style={{ color: '#cf1322' }} /> : isLoss ? <FallOutlined style={{ color: '#389e0d' }} /> : null}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>盘中实时估算</Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={24} lg={8}>
          <Card bordered={false} style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
             <div style={{ display: 'flex', gap: 16, alignItems: 'center', height: '100%' }}>
                <Button type="primary" size="medium" icon={<PlusOutlined />} onClick={onAddFund} block style={{ height: 36 }}>
                  添加基金
                </Button>
                <Button size="medium" icon={<AppstoreAddOutlined />} onClick={onCreatePortfolio} block style={{ height: 36 }}>
                  新建组合
                </Button>
             </div>
          </Card>
        </Col>
      </Row>

      {/* Main Content (Children) */}
      <div className="space-y-6">
        {children}
      </div>
    </div>
  );
}

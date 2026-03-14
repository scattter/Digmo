"use client";

import { FlatFundItem } from "@digmo/shared";
import { ReloadOutlined } from "@ant-design/icons";
import {
  Card,
  Button,
  Table,
  Tag,
  Skeleton,
  Typography,
  Space,
  Flex,
  Radio,
} from "antd";
import type { TableProps } from "antd";
import { FlatExpandMode } from "@/lib/api";
import { formatCurrency, formatSignedPct, trendTone } from "@/lib/format";
import { useState, useMemo } from "react";

const { Text } = Typography;

interface FlatFundsTableProps {
  data: FlatFundItem[];
  expand: FlatExpandMode;
  onExpandChange: (value: FlatExpandMode) => void;
  isLoading: boolean;
  isBusy: boolean;
  onRefresh: () => Promise<void>;
}

// Helper to map trend tone to Antd Tag color
function getTrendColor(tone: string): string {
  if (tone.includes("red")) return "red"; // rise
  if (tone.includes("green")) return "green"; // fall
  return "default";
}

export function FlatFundsTable({
  data,
  expand,
  onExpandChange,
  isLoading,
  isBusy,
  onRefresh,
}: FlatFundsTableProps) {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof FlatFundItem;
    order: "ascend" | "descend";
  } | null>(null);

  const sortedData = useMemo(() => {
    if (!sortConfig) return data;
    return [...data].sort((a, b) => {
      const aValue = (a as any)[sortConfig.key];
      const bValue = (b as any)[sortConfig.key];

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortConfig.order === "ascend"
          ? aValue - bValue
          : bValue - aValue;
      }
      return 0;
    });
  }, [data, sortConfig]);

  const handleTableChange: TableProps<FlatFundItem>["onChange"] = (
    pagination,
    filters,
    sorter,
  ) => {
    if (Array.isArray(sorter)) return;
    setSortConfig(
      sorter.order
        ? {
            key: sorter.columnKey as keyof FlatFundItem,
            order: sorter.order,
          }
        : null,
    );
  };

  const columns: TableProps<FlatFundItem>["columns"] = [
    {
      title: "基金名称",
      key: "name",
      fixed: "left",
      width: 140,
      render: (_, record) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <Text strong ellipsis={{ tooltip: record.fundName }}>
            {record.fundName ?? `基金 ${record.fundCode}`}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.fundCode}
          </Text>
        </div>
      ),
    },
    {
      title: "持仓金额",
      dataIndex: "holdingAmount",
      key: "holdingAmount",
      align: "center",
      width: 120,
      render: (value) => `¥${formatCurrency(value)}`,
      sorter: true,
    },
    {
      title: "总收益",
      dataIndex: "totalChangePct",
      key: "totalChangePct",
      align: "center",
      render: (value, record) => {
        const totalProfitAmount = record.holdingAmount * value;
        return (
          <span
            style={{
              color: value > 0 ? "#cf1322" : value < 0 ? "#389e0d" : "inherit",
            }}
          >
            {`¥${formatCurrency(totalProfitAmount)} / ${formatSignedPct(value)}`}
          </span>
        );
      },
      sorter: true,
    },
    {
      title: "盘中估算",
      dataIndex: "estimateChangePct",
      key: "estimateChangePct",
      align: "center",
      render: (value, record) => {
        const tone = trendTone(record.trend);
        const color = getTrendColor(tone);
        return <Tag color={color}>{formatSignedPct(value)}</Tag>;
      },
      sorter: true,
    },
    ...(expand === "dedup"
      ? [
          {
            title: "所属组合",
            key: "portfolio",
            render: (_: any, record: FlatFundItem) => (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.portfolioCount && record.portfolioCount > 1
                  ? `(${record.portfolioCount}) ${record.portfolioNames.join("/") || "-"}`
                  : (record.portfolioName ?? "-")}
              </Text>
            ),
          },
        ]
      : []),
  ];

  if (isLoading) {
    return (
      <Card title="基金平铺">
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }

  // Mobile card list render
  const renderMobileList = (items: FlatFundItem[]) => (
    <Flex vertical gap={16}>
      {items.map((item, index) => (
        <Card
          key={`${item.fundCode}-${item.portfolioId ?? "all"}-${index}`}
          size="small"
          title={item.fundName ?? `基金 ${item.fundCode}`}
          extra={
            <Tag color={getTrendColor(trendTone(item.trend))}>
              {formatSignedPct(item.estimateChangePct)}
            </Tag>
          }
        >
          <Space orientation="vertical" style={{ width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text type="secondary">代码</Text>
              <Text>{item.fundCode}</Text>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text type="secondary">持仓金额</Text>
              <Text>¥{formatCurrency(item.holdingAmount)}</Text>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text type="secondary">总收益</Text>
              <Text
                style={{
                  color:
                    item.totalChangePct > 0
                      ? "#cf1322"
                      : item.totalChangePct < 0
                        ? "#389e0d"
                        : "inherit",
                }}
              >
                {`¥${formatCurrency(item.holdingAmount * item.totalChangePct)} / ${formatSignedPct(item.totalChangePct)}`}
              </Text>
            </div>
          </Space>
        </Card>
      ))}
    </Flex>
  );

  // Desktop Table Render
  const renderDesktopTable = (items: FlatFundItem[]) => (
    <Table
      columns={columns}
      dataSource={items}
      rowKey={(record) => `${record.fundCode}-${record.portfolioId ?? "all"}`}
      pagination={false}
      scroll={{ x: 800 }}
      size="middle"
      onChange={handleTableChange}
    />
  );

  const refreshButton = (
    <Button
      icon={<ReloadOutlined />}
      onClick={() => void onRefresh()}
      disabled={isBusy}
      loading={isBusy}
      aria-label="手动更新"
      title="手动更新"
      style={{ width: 32, height: 32, padding: 0, borderRadius: 6 }}
    />
  );
  const expandToggle = (
    <Radio.Group
      value={expand}
      onChange={(event) => onExpandChange(event.target.value)}
      buttonStyle="solid"
      size="middle"
    >
      <Radio.Button value="dedup">去重汇总</Radio.Button>
      <Radio.Button value="expanded">按组合分组</Radio.Button>
    </Radio.Group>
  );

  const toolbar = (
    <div className="flex items-center justify-between gap-3">
      {expandToggle}
      {refreshButton}
    </div>
  );

  if (expand === "dedup") {
    return (
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        {toolbar}
        {sortedData.length === 0 ? (
          <Card>
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "rgba(0,0,0,0.45)",
                border: "1px dashed #d9d9d9",
                borderRadius: 6,
              }}
            >
              暂无基金数据，请先创建组合并添加基金。
            </div>
          </Card>
        ) : (
          <>
            <div className="hidden md:block">
              {renderDesktopTable(sortedData)}
            </div>
            <div className="md:hidden">{renderMobileList(sortedData)}</div>
          </>
        )}
      </Space>
    );
  }

  // Grouped logic
  const groupedData = sortedData.reduce(
    (acc: Record<string, { name: string; items: FlatFundItem[] }>, item) => {
      const key = item.portfolioId ?? "other";
      const name = item.portfolioName ?? "其他";
      if (!acc[key]) {
        acc[key] = { name, items: [] };
      }
      acc[key].items.push(item);
      return acc;
    },
    {},
  );

  const groupedEntries = Object.entries(groupedData);

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      {toolbar}
      {groupedEntries.length === 0 ? (
        <Card>
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "rgba(0,0,0,0.45)",
              border: "1px dashed #d9d9d9",
              borderRadius: 6,
            }}
          >
            暂无基金数据，请先创建组合并添加基金。
          </div>
        </Card>
      ) : (
        <>
          <div className="hidden md:flex md:flex-col md:gap-4">
            {groupedEntries.map(([key, group]) => (
              <section
                key={key}
                className="rounded-lg border border-gray-200 p-3"
              >
                <Text strong>{group.name}</Text>
                <div className="mt-3">{renderDesktopTable(group.items)}</div>
              </section>
            ))}
          </div>
          <div className="md:hidden">
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              {groupedEntries.map(([key, group]) => (
                <section key={key}>
                  <Text strong>{group.name}</Text>
                  <div className="mt-2">{renderMobileList(group.items)}</div>
                </section>
              ))}
            </Space>
          </div>
        </>
      )}
    </Space>
  );
}

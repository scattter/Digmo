"use client";

import { FlatFundItem } from "@digmo/shared";
import { ReloadOutlined } from "@ant-design/icons";
import Link from "next/link";
import { Card, Button, Table, Tag, Skeleton, Typography, Space, Flex } from "antd";
import type { TableProps } from "antd";
import { FlatExpandMode, SortOrder } from "@/lib/api";
import { formatCurrency, formatSignedPct, trendTone } from "@/lib/format";
import { useState, useMemo } from "react";

const { Text } = Typography;

interface FlatFundsTableProps {
  data: FlatFundItem[];
  expand: FlatExpandMode;
  isLoading: boolean;
  isBusy: boolean;
  flatSortOrder: SortOrder;
  flatSortLabel: string;
  onFlatSortToggle: () => void;
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
  isLoading,
  isBusy,
  flatSortOrder,
  flatSortLabel,
  onFlatSortToggle,
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
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.order === 'ascend' ? aValue - bValue : bValue - aValue;
      }
      return 0;
    });
  }, [data, sortConfig]);

  const handleTableChange: TableProps<FlatFundItem>['onChange'] = (pagination, filters, sorter) => {
    if (Array.isArray(sorter)) return;
    setSortConfig(sorter.order ? {
      key: sorter.columnKey as keyof FlatFundItem,
      order: sorter.order
    } : null);
  };

  const columns: TableProps<FlatFundItem>["columns"] = [
    {
      title: "基金名称",
      key: "name",
      fixed: "left",
      width: 140,
      render: (_, record) => (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
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
      title: "历史总涨跌",
      dataIndex: "totalChangePct",
      key: "totalChangePct",
      align: "center",
      render: (value) => (
        <span style={{ color: value > 0 ? "#cf1322" : value < 0 ? "#389e0d" : "inherit" }}>
          {formatSignedPct(value)}
        </span>
      ),
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
        return (
          <Tag color={color}>
            {formatSignedPct(value)}
          </Tag>
        );
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
                  : record.portfolioName ?? "-"}
              </Text>
            ),
          },
        ]
      : []),
    {
      title: "详情",
      key: "action",
      fixed: "right",
      align: "center",
      width: 100,
      render: (_, record) => (
        <Link href={`/funds/${record.fundCode}`} passHref legacyBehavior>
           <Button type="link" size="small">查看详情</Button>
        </Link>
      ),
    },
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
    <Flex vertical gap={16} className="md:hidden">
      {items.map((item, index) => (
        <Card
          key={`${item.fundCode}-${item.portfolioId ?? "all"}-${index}`}
          size="small"
          title={item.fundName ?? `基金 ${item.fundCode}`}
          extra={<Tag color={getTrendColor(trendTone(item.trend))}>{formatSignedPct(item.estimateChangePct)}</Tag>}
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
              <Text type="secondary">历史总涨跌</Text>
              <Text style={{ color: item.totalChangePct > 0 ? "#cf1322" : item.totalChangePct < 0 ? "#389e0d" : "inherit" }}>
                {formatSignedPct(item.totalChangePct)}
              </Text>
            </div>
            <div style={{ textAlign: "right", marginTop: 8 }}>
              <Link href={`/funds/${item.fundCode}`} passHref legacyBehavior>
                <Button type="link" size="small" style={{ padding: 0 }}>查看详情</Button>
              </Link>
            </div>
          </Space>
        </Card>
      ))}
    </Flex>
  );

  // Desktop Table Render
  const renderTable = (items: FlatFundItem[]) => (
    <Table
      columns={columns}
      dataSource={items}
      rowKey={(record) => `${record.fundCode}-${record.portfolioId ?? "all"}`}
      pagination={false}
      scroll={{ x: 800 }}
      size="middle"
      className="hidden md:block"
      onChange={handleTableChange}
    />
  );

  const refreshButton = (
    <Button
      icon={<ReloadOutlined />}
      onClick={() => void onRefresh()}
      disabled={isBusy}
      loading={isBusy}
    >
      手动更新
    </Button>
  );
  // Removed sortButton since we use table header sorting now

  if (expand === "dedup") {
    return (
      <Card title="所有基金 (去重)" extra={<Space>{refreshButton}</Space>}>
         {sortedData.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'rgba(0,0,0,0.45)', border: '1px dashed #d9d9d9', borderRadius: 6 }}>
               暂无基金数据，请先创建组合并添加基金。
            </div>
         ) : (
            <>
               {renderTable(sortedData)}
               {renderMobileList(sortedData)}
            </>
         )}
      </Card>
    );
  }

  // Grouped logic
  const groupedData = sortedData.reduce((acc: Record<string, { name: string; items: FlatFundItem[] }>, item) => {
    const key = item.portfolioId ?? "other";
    const name = item.portfolioName ?? "其他";
    if (!acc[key]) {
      acc[key] = { name, items: [] };
    }
    acc[key].items.push(item);
    return acc;
  }, {});

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
       <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {refreshButton}
       </div>
       {Object.keys(groupedData).length === 0 ? (
           <Card>
              <div style={{ padding: 24, textAlign: 'center', color: 'rgba(0,0,0,0.45)', border: '1px dashed #d9d9d9', borderRadius: 6 }}>
                 暂无基金数据，请先创建组合并添加基金。
              </div>
           </Card>
       ) : (
          Object.entries(groupedData).map(([key, group]) => (
            <Card key={key} title={group.name} size="small">
               {renderTable(group.items)}
               {renderMobileList(group.items)}
            </Card>
          ))
       )}
    </Space>
  );
}

import { FundEstimateSnapshot } from "@digmo/shared";
import { Card, Table, Typography } from "antd";
import type { TableProps } from "antd";

const { Text } = Typography;

interface FundHoldingsTableProps {
  snapshot: FundEstimateSnapshot;
}

function formatMarketCap(value?: number): string {
  if (typeof value !== "number") {
    return "-";
  }
  return `${(value / 100000000).toFixed(2)}亿`;
}

interface Holding {
  code: string;
  name: string;
  ratio: number;
  latestPrice?: number;
  changePct?: number;
  marketCap?: number;
  floatMarketCap?: number;
}

export function FundHoldingsTable({ snapshot }: FundHoldingsTableProps) {
  const holdings: Holding[] = snapshot.topHoldings ?? [];

  const columns: TableProps<Holding>["columns"] = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "占比",
      dataIndex: "ratio",
      key: "ratio",
      align: "right",
      render: (value) => <span style={{ fontFamily: 'monospace' }}>{(value * 100).toFixed(2)}%</span>,
    },
    {
      title: "最新价",
      dataIndex: "latestPrice",
      key: "latestPrice",
      align: "right",
      render: (value) => <span style={{ fontFamily: 'monospace' }}>{typeof value === "number" ? value.toFixed(2) : "-"}</span>,
    },
    {
      title: "涨跌",
      dataIndex: "changePct",
      key: "changePct",
      align: "right",
      render: (value) => <span style={{ fontFamily: 'monospace' }}>{typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "-"}</span>,
    },
    {
      title: "总市值",
      dataIndex: "marketCap",
      key: "marketCap",
      align: "right",
      render: (value) => <span style={{ fontFamily: 'monospace' }}>{formatMarketCap(value)}</span>,
    },
    {
      title: "流通市值",
      dataIndex: "floatMarketCap",
      key: "floatMarketCap",
      align: "right",
      render: (value) => <span style={{ fontFamily: 'monospace' }}>{formatMarketCap(value)}</span>,
    },
  ];

  return (
    <Card title="前五持仓">
      {holdings.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>暂无持仓数据</Text>
      ) : (
        <Table
          dataSource={holdings}
          columns={columns}
          pagination={false}
          size="small"
          rowKey="code"
          scroll={{ x: 600 }}
        />
      )}
    </Card>
  );
}

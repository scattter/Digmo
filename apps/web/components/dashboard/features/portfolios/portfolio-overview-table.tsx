"use client";

import { PortfolioSummary } from "@digmo/shared";
import { 
  EditOutlined, 
  ReloadOutlined, 
  MoreOutlined, 
  DeleteOutlined,
  RiseOutlined,
  FallOutlined,
  FolderOpenOutlined,
  RightOutlined
} from "@ant-design/icons";
import { Button, Card, Col, Dropdown, Input, Row, Skeleton, Tag, Typography, Space, Empty } from "antd";
import type { MenuProps } from "antd";
import { formatCurrency, formatSignedPct } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-is-mobile";

const { Title, Text } = Typography;

interface PortfolioOverviewTableProps {
  portfolios: PortfolioSummary[];
  isLoading: boolean;
  isBusy: boolean;
  editingPortfolioId: string | null;
  editingPortfolioName: string;
  onOpen: (portfolio: PortfolioSummary) => void;
  onDelete: (portfolio: PortfolioSummary) => void;
  onStartRename: (portfolio: PortfolioSummary) => void;
  onRenameInputChange: (value: string) => void;
  onCommitRename: (portfolio: PortfolioSummary) => Promise<void> | void;
  onCancelRename: () => void;
  onRefresh: () => Promise<void>;
}

export function PortfolioOverviewTable({
  portfolios,
  isLoading,
  isBusy,
  editingPortfolioId,
  editingPortfolioName,
  onOpen,
  onDelete,
  onStartRename,
  onRenameInputChange,
  onCommitRename,
  onCancelRename,
  onRefresh
}: PortfolioOverviewTableProps) {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-3">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 8 : 12, gap: 12 }}>
        <div>
          <Title level={isMobile ? 4 : 3} style={{ marginBottom: 0 }}>基金组合</Title>
          <Text type="secondary" style={{ fontSize: isMobile ? 12 : 13 }}>管理您的投资组合资产配比与收益</Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => void onRefresh()}
          disabled={isBusy}
          loading={isBusy}
          size={isMobile ? "small" : "middle"}
        >
          刷新数据
        </Button>
      </div>

      {isLoading ? (
        <Row gutter={[12, 12]}>
          {[1, 2, 3].map((i) => (
            <Col xs={24} md={12} lg={8} key={i}>
              <Card styles={{ body: { padding: isMobile ? 12 : 16 } }}>
                <Skeleton active paragraph={{ rows: 3 }} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : portfolios.length === 0 ? (
        <div style={{ padding: isMobile ? 24 : 40, background: '#fff', borderRadius: 8, border: '1px dashed #d9d9d9', textAlign: 'center' }}>
           <Empty
              description={
                 <span>
                    <Text strong style={{ fontSize: isMobile ? 14 : 16 }}>暂无组合</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>您还没有创建任何基金组合。开始创建一个以跟踪您的投资。</Text>
                 </span>
              }
           />
        </div>
      ) : (
        <Row gutter={[12, 12]}>
          {portfolios.map((portfolio) => (
            <Col xs={24} md={12} lg={8} key={portfolio.id}>
              <PortfolioCard
                portfolio={portfolio}
                isEditing={editingPortfolioId === portfolio.id}
                editingName={editingPortfolioName}
                isBusy={isBusy}
                onOpen={() => onOpen(portfolio)}
                onDelete={() => onDelete(portfolio)}
                onStartRename={() => onStartRename(portfolio)}
                onRenameInputChange={onRenameInputChange}
                onCommitRename={() => onCommitRename(portfolio)}
                onCancelRename={onCancelRename}
                isMobile={isMobile}
              />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

function PortfolioCard({
  portfolio,
  isEditing,
  editingName,
  isBusy,
  onOpen,
  onDelete,
  onStartRename,
  onRenameInputChange,
  onCommitRename,
  onCancelRename,
  isMobile
}: {
  portfolio: PortfolioSummary;
  isEditing: boolean;
  editingName: string;
  isBusy: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onStartRename: () => void;
  onRenameInputChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  isMobile: boolean;
}) {
  const isProfit = typeof portfolio.dailyProfitPct === "number" && portfolio.dailyProfitPct > 0;
  const isLoss = typeof portfolio.dailyProfitPct === "number" && portfolio.dailyProfitPct < 0;

  const menuItems: MenuProps['items'] = [
    { key: 'open', label: '查看详情', icon: <FolderOpenOutlined />, onClick: onOpen },
    { key: 'rename', label: '重命名', icon: <EditOutlined />, onClick: onStartRename },
    { type: 'divider' },
    { key: 'delete', label: '删除组合', icon: <DeleteOutlined />, danger: true, onClick: onDelete },
  ];

  return (
    <Card
      hoverable
      styles={{ body: { padding: isMobile ? 12 : 16 } }}
      title={
        isEditing ? (
          <Input
            autoFocus
            value={editingName}
            onChange={(e) => onRenameInputChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitRename();
              if (e.key === "Escape") onCancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div onClick={onOpen} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
             <Text strong style={{ fontSize: isMobile ? 14 : 15, marginRight: 8 }}>{portfolio.name}</Text>
             <RightOutlined style={{ fontSize: 12, color: 'rgba(0,0,0,0.25)' }} />
          </div>
        )
      }
      extra={
        <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
          <Button type="text" size={isMobile ? "small" : "middle"} icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      }
    >
      <div style={{ marginBottom: isMobile ? 10 : 12 }}>
         <Space>
            <Tag style={{ marginInlineEnd: 4, fontSize: isMobile ? 10 : 12 }}>{portfolio.type === "FREE" ? "自由" : "按比例"}</Tag>
            <Text type="secondary" style={{ fontSize: isMobile ? 11 : 12 }}>{portfolio.fundCount} 只基金</Text>
         </Space>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: isMobile ? 10 : 12 }}>
        <Text type="secondary" style={{ fontSize: isMobile ? 11 : 12 }}>总资产</Text>
        <Text strong style={{ fontSize: isMobile ? 20 : 22, fontFamily: 'monospace', lineHeight: 1.25 }}>
          ¥{formatCurrency(portfolio.totalAmount)}
        </Text>
      </div>

      <div style={{ background: '#f5f5f5', padding: isMobile ? 6 : 8, borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Text type="secondary" style={{ fontSize: isMobile ? 10 : 11, textTransform: 'uppercase' }}>当日收益</Text>
          <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'monospace', fontWeight: 600, fontSize: isMobile ? 12 : 13, color: isProfit ? '#cf1322' : isLoss ? '#389e0d' : 'inherit' }}>
            {isProfit && <RiseOutlined style={{ marginRight: 4 }} />}
            {isLoss && <FallOutlined style={{ marginRight: 4 }} />}
            {formatSignedPct(portfolio.dailyProfitPct)}
          </div>
        </div>
        {portfolio.allFundsDailyUpdated && (
          <Tag style={{ margin: 0, fontSize: isMobile ? 9 : 10, paddingInline: isMobile ? 5 : 7 }}>已更新</Tag>
        )}
        </div>
    </Card>
  );
}

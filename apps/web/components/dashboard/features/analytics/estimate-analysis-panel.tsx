"use client";

import { SortOrder } from "@/lib/api";
import { deltaClassByPct, formatSignedCurrency, formatSignedPct } from "@/lib/format";
import { getEstimateSortButtonLabel } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";
import { Card, Button, Typography, List, Space } from "antd";
import { SortAscendingOutlined, SortDescendingOutlined, UnorderedListOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface EstimateAnalysisRow {
  fundCode: string;
  fundName: string;
  estimateChangePct: number;
  intradayAmount: number;
}

interface EstimateAnalysisPanelProps {
  rows: EstimateAnalysisRow[];
  sortOrder: SortOrder;
  onToggleSort: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  disabled: boolean;
  compact?: boolean;
  className?: string;
}

export function EstimateAnalysisPanel({
  rows,
  sortOrder,
  onToggleSort,
  expanded,
  onToggleExpanded,
  disabled,
  compact = false,
  className
}: EstimateAnalysisPanelProps) {
  return (
    <Card 
      className={cn("flex flex-col", className)}
      styles={{ body: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
      title={
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong>今日预估</Text>
            <Space>
               <Button size="small" onClick={onToggleExpanded} disabled={disabled}>
                  {expanded ? "收起" : "展开"}
               </Button>
               <Button 
                  size="small" 
                  onClick={onToggleSort} 
                  disabled={disabled || !expanded}
                  icon={sortOrder === 'asc' ? <SortAscendingOutlined /> : sortOrder === 'desc' ? <SortDescendingOutlined /> : <UnorderedListOutlined />}
               >
                  {getEstimateSortButtonLabel(sortOrder)}
               </Button>
            </Space>
         </div>
      }
    >
        {rows.length === 0 ? <Text type="secondary" style={{ fontSize: 12 }}>当前组合暂无基金数据。</Text> : null}

        {rows.length > 0 && !expanded ? <Text type="secondary" style={{ fontSize: 12 }}>已收起，点击“展开”查看今日预估。</Text> : null}

        {rows.length > 0 && expanded ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            <List
               size="small"
               dataSource={rows}
               split={false}
               renderItem={(row) => (
                  <List.Item style={{ padding: compact ? '8px 0' : '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                     <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                           <Text strong style={{ fontSize: 14 }}>{row.fundName}</Text>
                           {!compact && <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{row.fundCode}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                           <span className={deltaClassByPct(row.estimateChangePct)} style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                              {formatSignedCurrency(row.intradayAmount)}/{formatSignedPct(row.estimateChangePct)}
                           </span>
                        </div>
                     </div>
                  </List.Item>
               )}
            />
          </div>
        ) : null}
    </Card>
  );
}

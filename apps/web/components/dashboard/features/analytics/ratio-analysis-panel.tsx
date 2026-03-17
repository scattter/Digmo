"use client";

import { SortOrder } from "@/lib/api";
import { deltaClassByPct, formatPct, formatSignedAmountCompact, formatSignedPct } from "@/lib/format";
import { getEstimateSortButtonLabel } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";
import { Card, Button, Typography, Space, Progress, Tooltip } from "antd";
import { SortAscendingOutlined, SortDescendingOutlined, UnorderedListOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface RatioAnalysisRow {
  fundCode: string;
  fundName: string;
  plannedRatio: number;
  actualRatio: number;
  estimateChangePct?: number;
  intradayAmount?: number;
  overByMoreThan15Pct: boolean;
}

interface RatioAnalysisPanelProps {
  rows: RatioAnalysisRow[];
  sortOrder: SortOrder;
  onToggleSort: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  disabled: boolean;
  className?: string;
}

export function RatioAnalysisPanel({
  rows,
  sortOrder,
  onToggleSort,
  expanded,
  onToggleExpanded,
  disabled,
  className
}: RatioAnalysisPanelProps) {
  return (
    <Card 
      className={cn("flex flex-col", className)}
      styles={{ body: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
      title={
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong>比例达成</Text>
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
        {rows.length === 0 ? <Text type="secondary" style={{ fontSize: 12 }}>当前组合暂无可分析的比例数据。</Text> : null}

        {rows.length > 0 && !expanded ? <Text type="secondary" style={{ fontSize: 12 }}>已收起，点击“展开”查看达成详情。</Text> : null}

        {rows.length > 0 && expanded ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {rows.map((row) => {
                const overrun = Math.max(0, row.actualRatio - row.plannedRatio);
                const percent = row.plannedRatio > 0 ? Math.min((row.actualRatio / row.plannedRatio) * 100, 100) : row.actualRatio > 0 ? 100 : 0;
                
                return (
                  <Card key={row.fundCode} size="small" type="inner" bordered>
                    <div style={{ marginBottom: 8 }}>
                      <Text strong ellipsis={{ tooltip: row.fundName }} style={{ display: 'block' }}>
                        {row.fundName}
                      </Text>
                      <div
                        className={deltaClassByPct(typeof row.estimateChangePct === "number" ? row.estimateChangePct : 0)}
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                      >
                        <span>{formatSignedAmountCompact(row.intradayAmount)}</span>
                        <span>({formatSignedPct(row.estimateChangePct)})</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>
                       <span>计划 {formatPct(row.plannedRatio)}</span>
                       <span>实际 {formatPct(row.actualRatio)}</span>
                    </div>

                    <Progress 
                       percent={percent} 
                       showInfo={false} 
                       status={overrun > 0 ? "exception" : "success"}
                       size="small"
                    />
                    
                    {overrun > 0 && (
                       <div style={{ marginTop: 4, textAlign: 'right' }}>
                          <Text type="warning" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                             +{(overrun * 100).toFixed(2)}%
                          </Text>
                       </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ) : null}
    </Card>
  );
}

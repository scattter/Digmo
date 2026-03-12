"use client";

import { DailyDecision } from "@digmo/shared";
import { useMemo } from "react";
import { Modal, Collapse, Tag, Typography, Button, Space, Card, Spin } from "antd";
import { formatBeijingTime, formatPct } from "@/lib/format";
import { LinkOutlined } from "@ant-design/icons";

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface DecisionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isBusy: boolean;
  isLoading: boolean;
  items: DailyDecision[];
}

function formatHistoryDate(input: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date(input));
}

export function DecisionHistoryDialog(props: DecisionHistoryDialogProps) {
  const { open, onOpenChange, isBusy, isLoading, items } = props;

  const collapseItems = useMemo(() => {
    return items.map((item) => {
      const label = formatHistoryDate(item.createdAt);
      return {
        key: item.id,
        label: <Text strong>{label}</Text>,
        children: (
          <div className="space-y-4">
             <div>
                <Paragraph style={{ whiteSpace: 'pre-line' }}>{item.summary}</Paragraph>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  生成于 {formatBeijingTime(item.createdAt)} · 耗时 {item.latencyMs}ms · token {item.usage.totalTokens ?? "-"}
                </Text>
             </div>

             {item.actions.length === 0 ? (
                <div style={{ padding: 16, border: '1px dashed #d9d9d9', borderRadius: 6, textAlign: 'center' }}>
                   <Text type="secondary">本次生成无动作建议。</Text>
                </div>
             ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                   {item.actions.map((action, index) => (
                      <Card key={`${item.id}:${index}`} size="small" type="inner" variant={'borderless'}>
                         <Space wrap style={{ marginBottom: 8 }}>
                            <Tag color="blue">{action.actionType}</Tag>
                            <Text code>{action.fundCode}</Text>
                            {action.fundName && <Text>{action.fundName}</Text>}
                            <Tag>{action.riskLevel}</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>置信度 {formatPct(action.confidence)}</Text>
                         </Space>
                         
                         <Paragraph style={{ whiteSpace: 'pre-line', marginBottom: 8 }}>{action.rationale}</Paragraph>
                         
                         <div style={{ marginBottom: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                               触发条件：{action.triggerCondition} · 失效时间：{formatBeijingTime(action.validUntil)}
                            </Text>
                         </div>
                         
                         {action.citations.length > 0 && (
                            <div style={{ background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                               <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>来源依据</Text>
                               {action.citations.map((citation, cIndex) => (
                                  <div key={cIndex} style={{ marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid #e8e8e8' }}>
                                     <Text strong style={{ fontSize: 12 }}>{citation.title}</Text>
                                     <Paragraph ellipsis={{ rows: 2, expandable: true, symbol: '展开' }} style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>
                                        {citation.snippet}
                                     </Paragraph>
                                     <Space size="small">
                                        <Tag style={{ fontSize: 10 }}>{citation.sourceType}</Tag>
                                        {citation.url && (
                                           <a href={citation.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                                              <LinkOutlined /> 来源链接
                                           </a>
                                        )}
                                     </Space>
                                  </div>
                               ))}
                            </div>
                         )}
                      </Card>
                   ))}
                </div>
             )}
          </div>
        )
      };
    });
  }, [items]);

  return (
    <Modal
      title="建议历史"
      open={open}
      onCancel={() => onOpenChange(false)}
      footer={[
        <Button key="close" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      ]}
      width={800}
      styles={{ body: { padding: 0, maxHeight: '70vh', overflowY: 'auto' } }}
      centered
    >
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
           <Text type="secondary">默认仅显示日期，点击展开可查看完整建议内容。</Text>
        </div>
        
        {isLoading ? (
           <div style={{ textAlign: 'center', padding: 32 }}>
              <Spin description="加载中..." />
           </div>
        ) : items.length === 0 ? (
           <div style={{ padding: 32, border: '1px dashed #d9d9d9', borderRadius: 6, textAlign: 'center' }}>
              <Text type="secondary">暂无建议历史</Text>
           </div>
        ) : (
           <Collapse items={collapseItems} bordered={false} defaultActiveKey={[]} />
        )}
      </div>
    </Modal>
  );
}

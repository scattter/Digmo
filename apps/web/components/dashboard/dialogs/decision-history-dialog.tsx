"use client";

import { DailyDecision } from "@digmo/shared";
import { useMemo } from "react";
import { Modal, Collapse, Typography, Button, Spin } from "antd";
import { formatBeijingTime } from "@/lib/format";

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
          <div>
             <Paragraph style={{ whiteSpace: 'pre-line', marginBottom: 12 }}>{item.summary}</Paragraph>
             <Text type="secondary" style={{ fontSize: 12 }}>
               生成于 {formatBeijingTime(item.createdAt)} · 耗时 {item.latencyMs}ms · token {item.usage.totalTokens ?? "-"}
             </Text>
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

"use client";

import {
  PortfolioFundItem,
  PositionOperationType,
} from "@digmo/shared";
import { useEffect, useState } from "react";
import { Modal, Input, Segmented, Form, Typography, Space } from "antd";

import { FundEditState } from "@/lib/format";

const { Text } = Typography;

interface UpdateFundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PortfolioFundItem | null;
  editState: FundEditState;
  onEditFieldChange: (key: keyof FundEditState, value: string) => void;
  onUpdate: () => Promise<void>;
  onOperate: (
    operationType: PositionOperationType,
    amountRaw: string
  ) => Promise<void>;
  isBusy?: boolean;
}

export function UpdateFundDialog({
  open,
  onOpenChange,
  target,
  editState,
  onEditFieldChange,
  onUpdate,
  onOperate,
  isBusy,
}: UpdateFundDialogProps) {
  const [mode, setMode] = useState<"DIRECT" | "INCREASE" | "DECREASE">("DIRECT");
  const [operationAmount, setOperationAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when dialog opens/closes or target changes
  useEffect(() => {
    if (open) {
      setMode("DIRECT");
      setOperationAmount("");
      setIsSubmitting(false);
    }
  }, [open, target]);

  if (!target) return null;

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      if (mode === "DIRECT") {
        await onUpdate();
      } else {
        await onOperate(mode as PositionOperationType, operationAmount);
      }
      onOpenChange(false);
    } catch (error) {
      // Error handling is done by parent usually, but we stop loading state
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      title="更新基金"
      open={open}
      onCancel={() => onOpenChange(false)}
      onOk={handleSubmit}
      confirmLoading={isBusy || isSubmitting}
      okText={mode === "DIRECT" ? "确认更新" : mode === "INCREASE" ? "确认加仓" : "确认减仓"}
      cancelText="取消"
      centered
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <div style={{ marginBottom: 8 }}>
           <Text type="secondary">
             {target.fundName ?? `基金 ${target.fundCode}`} ({target.fundCode})
           </Text>
        </div>

        <Segmented
          block
          options={[
            { label: '直接更新', value: 'DIRECT' },
            { label: '加仓', value: 'INCREASE' },
            { label: '减仓', value: 'DECREASE' },
          ]}
          value={mode}
          onChange={(v) => setMode(v as any)}
          disabled={isBusy}
        />

        {mode === "DIRECT" ? (
          <Form layout="vertical">
            <Form.Item label="持仓金额">
              <Input
                value={editState.holdingAmount}
                onChange={(e) => onEditFieldChange("holdingAmount", e.target.value)}
                disabled={isBusy}
                placeholder="请输入持仓金额"
              />
            </Form.Item>

            {target.portfolioType === "RATIO" && (
              <Form.Item label="计划持有比例(%)">
                <Input
                  value={editState.plannedRatio}
                  onChange={(e) => onEditFieldChange("plannedRatio", e.target.value)}
                  disabled={isBusy}
                  placeholder="例如：25"
                />
              </Form.Item>
            )}

            <Form.Item label="持有收益金额">
              <Input
                value={editState.holdingProfitAmount}
                onChange={(e) =>
                  onEditFieldChange("holdingProfitAmount", e.target.value)
                }
                disabled={isBusy}
                placeholder="例如：-88.36（不填默认为 0）"
              />
            </Form.Item>
          </Form>
        ) : (
          <Form layout="vertical">
            <Form.Item label={mode === "INCREASE" ? "加仓金额" : "减仓金额"}>
              <Input
                value={operationAmount}
                onChange={(e) => setOperationAmount(e.target.value)}
                disabled={isBusy}
                placeholder="请输入金额"
              />
            </Form.Item>
          </Form>
        )}
      </Space>
    </Modal>
  );
}

"use client";

import { Modal, Form, Input } from "antd";
import { PortfolioSummary } from "@digmo/shared";
import { useEffect } from "react";

interface PortfolioAddFundFormValues {
  fundCode: string;
  holdingAmount: string;
  holdingProfitAmount?: string;
  plannedRatio?: string;
}

interface PortfolioAddFundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PortfolioAddFundFormValues) => Promise<void>;
  targetPortfolio: PortfolioSummary | null;
  isBusy?: boolean;
}

export function PortfolioAddFundDialog({
  open,
  onOpenChange,
  onSubmit,
  targetPortfolio,
  isBusy,
}: PortfolioAddFundDialogProps) {
  const [form] = Form.useForm<PortfolioAddFundFormValues>();

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      await onSubmit(values);
      form.resetFields();
    } catch (info) {
      console.log('Validate Failed:', info);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    form.resetFields();
  };

  useEffect(() => {
    if (!open) {
      form.resetFields();
    }
  }, [open, form]);

  return (
    <Modal
      title="添加基金到当前组合"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isBusy}
      okText="确认添加"
      cancelText="取消"
      destroyOnClose
    >
      <div style={{ marginBottom: 16, color: 'rgba(0, 0, 0, 0.45)' }}>
        {targetPortfolio ? `目标组合：${targetPortfolio.name}` : ""}
      </div>
      <Form
        form={form}
        layout="vertical"
        name="portfolio_add_fund_form"
      >
        <Form.Item
          name="fundCode"
          label="基金代码"
          rules={[
            { required: true, message: "请输入基金代码" },
            { pattern: /^\d{6}$/, message: "请输入 6 位基金代码" }
          ]}
        >
          <Input placeholder="000000" disabled={isBusy} maxLength={6} />
        </Form.Item>

        <Form.Item
          name="holdingAmount"
          label="持仓金额"
          rules={[{ required: true, message: "请输入持仓金额" }]}
        >
          <Input placeholder="例如：5000" disabled={isBusy} />
        </Form.Item>

        <Form.Item
          name="holdingProfitAmount"
          label="持有收益金额（可正可负）"
        >
          <Input placeholder="例如：-88.36（不填默认为 0）" disabled={isBusy} />
        </Form.Item>

        {targetPortfolio?.type === "RATIO" && (
          <Form.Item
            name="plannedRatio"
            label="计划比例(%)"
            rules={[{ required: true, message: "请输入计划比例" }]}
          >
            <Input placeholder="例如：25" disabled={isBusy} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

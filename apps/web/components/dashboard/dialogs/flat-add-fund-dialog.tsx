"use client";

import { Modal, Form, Input, Select, Button } from "antd";
import { PortfolioSummary } from "@digmo/shared";
import { useMemo, useEffect } from "react";

interface FlatAddFundFormValues {
  portfolioId: string;
  fundCode: string;
  holdingAmount: string;
  holdingProfitAmount?: string;
  plannedRatio?: string;
}

interface FlatAddFundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: FlatAddFundFormValues) => Promise<void>;
  portfolios: PortfolioSummary[];
  isBusy?: boolean;
  initialPortfolioId?: string;
}

export function FlatAddFundDialog({
  open,
  onOpenChange,
  onSubmit,
  portfolios,
  isBusy,
  initialPortfolioId,
}: FlatAddFundDialogProps) {
  const [form] = Form.useForm<FlatAddFundFormValues>();
  const portfolioId = Form.useWatch("portfolioId", form);

  const selectedPortfolio = useMemo(
    () => portfolios.find((p) => p.id === portfolioId),
    [portfolios, portfolioId]
  );

  useEffect(() => {
    if (open && initialPortfolioId) {
      form.setFieldsValue({ portfolioId: initialPortfolioId });
    }
  }, [open, initialPortfolioId, form]);

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
  
  // When dialog opens/closes, we might want to reset. 
  // Antd Modal doesn't unmount by default (destroyOnClose={false}).
  // We can use destroyOnClose={true} or reset manually.
  
  useEffect(() => {
    if (!open) {
      form.resetFields();
    }
  }, [open, form]);

  return (
    <Modal
      title="添加基金"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isBusy}
      okText="确认添加"
      cancelText="取消"
      destroyOnHidden
      centered
    >
      <div style={{ marginBottom: 16, color: 'rgba(0, 0, 0, 0.45)' }}>
        先选择目标组合，再填写基金信息。
      </div>
      <Form
        form={form}
        layout="vertical"
        name="flat_add_fund_form"
      >
        <Form.Item
          name="portfolioId"
          label="目标组合"
          rules={[{ required: true, message: "请选择目标组合" }]}
        >
          <Select placeholder="请选择目标组合" disabled={isBusy}>
            {portfolios.map((portfolio) => (
              <Select.Option key={portfolio.id} value={portfolio.id}>
                {portfolio.name}（{portfolio.type === "FREE" ? "自由" : "按比例"}）
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

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

        {selectedPortfolio?.type === "RATIO" && (
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

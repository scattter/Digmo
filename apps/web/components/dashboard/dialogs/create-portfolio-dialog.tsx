"use client";

import { Modal, Form, Input, Select, Button } from "antd";
import { PortfolioType } from "@digmo/shared";

interface CreatePortfolioFormValues {
  name: string;
  type: PortfolioType;
  totalAsset: string;
}

interface CreatePortfolioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreatePortfolioFormValues) => Promise<void>;
  isBusy?: boolean;
}

export function CreatePortfolioDialog({
  open,
  onOpenChange,
  onSubmit,
  isBusy,
}: CreatePortfolioDialogProps) {
  const [form] = Form.useForm<CreatePortfolioFormValues>();

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

  return (
    <Modal
      title="创建组合"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isBusy}
      okText="确认创建"
      cancelText="取消"
      forceRender
      centered
    >
      <div style={{ marginBottom: 16, color: 'rgba(0, 0, 0, 0.45)' }}>
        填写组合名称、类型和组合总资产。
      </div>
      <Form
        form={form}
        layout="vertical"
        name="create_portfolio_form"
        initialValues={{ type: "FREE", totalAsset: "0" }}
      >
        <Form.Item
          name="name"
          label="组合名称"
          rules={[
            { required: true, message: "请输入组合名称" },
            { max: 32, message: "组合名称长度不能超过 32" }
          ]}
        >
          <Input placeholder="例如：稳健组合" disabled={isBusy} />
        </Form.Item>

        <Form.Item
          name="type"
          label="组合类型"
          rules={[{ required: true, message: "请选择组合类型" }]}
        >
          <Select disabled={isBusy}>
            <Select.Option value="FREE">自由组合</Select.Option>
            <Select.Option value="RATIO">按比例组合</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="totalAsset"
          label="组合总资产"
          rules={[
            {
              validator: async (_, value: string) => {
                const normalized = value?.trim?.() ?? "";
                if (!normalized) {
                  throw new Error("请输入组合总资产");
                }
                const amount = Number(normalized.replace(/,/g, ""));
                if (!Number.isFinite(amount) || amount < 0) {
                  throw new Error("组合总资产必须是大于等于 0 的数字");
                }
              }
            }
          ]}
        >
          <Input placeholder="例如：10000" disabled={isBusy} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

"use client";

import { Form, Input, Modal } from "antd";

interface ImportPortfolioDialogValues {
  shareCode: string;
  password?: string;
}

interface ImportPortfolioDialogProps {
  open: boolean;
  isBusy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { shareCode: string; password?: string }) => Promise<void>;
}

export function ImportPortfolioDialog(props: ImportPortfolioDialogProps) {
  const [form] = Form.useForm<ImportPortfolioDialogValues>();
  const { open, isBusy, onOpenChange, onSubmit } = props;

  async function handleOk(): Promise<void> {
    const values = await form.validateFields();
    await onSubmit({
      shareCode: values.shareCode.trim().toUpperCase(),
      ...(values.password?.trim() ? { password: values.password.trim() } : {}),
    });
    form.resetFields();
  }

  function handleClose(): void {
    onOpenChange(false);
    form.resetFields();
  }

  return (
    <Modal
      title="导入组合"
      open={open}
      onCancel={handleClose}
      onOk={() => void handleOk()}
      confirmLoading={isBusy}
      okText="导入"
      cancelText="取消"
      centered
    >
      <Form form={form} layout="vertical" initialValues={{ shareCode: "", password: "" }}>
        <Form.Item
          name="shareCode"
          label="组合码"
          rules={[
            { required: true, message: "请输入组合码" },
            {
              validator: (_, value: string | undefined) => {
                const normalized = value?.trim().toUpperCase() ?? "";
                return /^[A-Z0-9]{8}$/.test(normalized)
                  ? Promise.resolve()
                  : Promise.reject(new Error("组合码必须是 8 位字母数字"));
              },
            },
          ]}
        >
          <Input placeholder="例如：A1B2C3D4" disabled={isBusy} maxLength={8} />
        </Form.Item>
        <Form.Item
          name="password"
          label="组合密码（如有）"
          rules={[
            {
              validator: (_, value: string | undefined) => {
                if (!value || value.trim().length === 0) {
                  return Promise.resolve();
                }
                return /^\d{6}$/.test(value.trim())
                  ? Promise.resolve()
                  : Promise.reject(new Error("密码必须为 6 位数字"));
              },
            },
          ]}
        >
          <Input placeholder="例如：123456" disabled={isBusy} maxLength={6} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

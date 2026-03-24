"use client";

import { App, Button, Form, Input, Modal, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { PortfolioShareResult, PortfolioShareValidity } from "@digmo/shared";

const { Text } = Typography;

interface SharePortfolioDialogValues {
  validity: PortfolioShareValidity;
  password?: string;
}

interface SharePortfolioDialogProps {
  open: boolean;
  portfolioId?: string;
  portfolioName?: string;
  isBusy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    portfolioId: string;
    validity: PortfolioShareValidity;
    password?: string;
  }) => Promise<PortfolioShareResult>;
}

export function SharePortfolioDialog(props: SharePortfolioDialogProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<SharePortfolioDialogValues>();
  const [result, setResult] = useState<PortfolioShareResult | null>(null);
  const { open, portfolioId, portfolioName, isBusy, onOpenChange, onSubmit } = props;

  useEffect(() => {
    if (!open) {
      setResult(null);
      form.resetFields();
      form.setFieldsValue({ validity: "SEVEN_DAYS", password: "" });
    }
  }, [form, open]);

  const validityOptions = useMemo(
    () => [
      { label: "7天（默认）", value: "SEVEN_DAYS" as const },
      { label: "永久", value: "PERMANENT" as const },
    ],
    [],
  );

  async function handleGenerate(): Promise<void> {
    if (!portfolioId) {
      return;
    }
    const values = await form.validateFields();
    const password = values.password?.trim() || undefined;
    const generated = await onSubmit({
      portfolioId,
      validity: values.validity ?? "SEVEN_DAYS",
      ...(password ? { password } : {}),
    });
    setResult(generated);
  }

  async function handleCopy(): Promise<void> {
    if (!result?.shareCode) {
      return;
    }
    try {
      await navigator.clipboard.writeText(result.shareCode);
      message.success("组合码已复制");
    } catch {
      message.error("复制失败，请手动复制");
    }
  }

  function handleClose(): void {
    onOpenChange(false);
  }

  return (
    <Modal
      title={`分享组合${portfolioName ? ` · ${portfolioName}` : ""}`}
      open={open}
      onCancel={handleClose}
      okText={result ? "重新生成" : "生成组合码"}
      cancelText="关闭"
      onOk={() => void handleGenerate()}
      confirmLoading={isBusy}
      forceRender
      centered
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ validity: "SEVEN_DAYS", password: "" }}
      >
        <Form.Item
          name="validity"
          label="组合有效期"
          rules={[{ required: true, message: "请选择有效期" }]}
        >
          <Select options={validityOptions} disabled={isBusy} />
        </Form.Item>
        <Form.Item
          name="password"
          label="组合密码（可选）"
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

      {result ? (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Text type="secondary">组合码</Text>
            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              <Text code style={{ fontSize: 16 }}>
                {result.shareCode}
              </Text>
              <Button size="small" onClick={() => void handleCopy()}>
                复制
              </Button>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {result.expiresAt ? `有效期至 ${new Date(result.expiresAt).toLocaleString("zh-CN")}` : "永久有效"}
            </Text>
          </Space>
        </div>
      ) : null}
    </Modal>
  );
}

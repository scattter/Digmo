"use client";

import { useEffect } from "react";
import { Form, Input, Modal, Select, Typography } from "antd";
import { DecisionAiMode, UserDecisionAiConfigSummary } from "@digmo/shared";

const { Paragraph, Text } = Typography;

interface DecisionAiConfigFormValues {
  baseUrl: string;
  model: string;
  mode: DecisionAiMode;
  apiKey?: string;
}

interface DecisionAiConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DecisionAiConfigFormValues) => Promise<void>;
  config: UserDecisionAiConfigSummary | null;
  isBusy?: boolean;
}

export function DecisionAiConfigDialog({
  open,
  onOpenChange,
  onSubmit,
  config,
  isBusy,
}: DecisionAiConfigDialogProps) {
  const [form] = Form.useForm<DecisionAiConfigFormValues>();

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue({
      baseUrl: config?.baseUrl ?? "https://api.openai.com/v1",
      model: config?.model ?? "",
      mode: config?.mode ?? "chat_completions",
      apiKey: "",
    });
  }, [config, form, open]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      await onSubmit({
        baseUrl: values.baseUrl.trim(),
        model: values.model.trim(),
        mode: values.mode,
        apiKey: values.apiKey?.trim() || undefined,
      });
      form.resetFields(["apiKey"]);
    } catch {
      // Validation feedback is handled by Form.Item.
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    form.resetFields();
  };

  return (
    <Modal
      title="AI 模型配置"
      open={open}
      onOk={() => void handleOk()}
      onCancel={handleCancel}
      confirmLoading={isBusy}
      okText="保存配置"
      cancelText="取消"
      forceRender
      centered
    >
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        决策建议会使用你个人配置的兼容 OpenAI 接口地址、模型和 API Key。未配置前将无法更新建议。
      </Paragraph>

      <Form form={form} layout="vertical" name="decision_ai_config_form">
        <Form.Item
          name="baseUrl"
          label="调用地址"
          rules={[
            { required: true, message: "请输入调用地址" },
            { max: 500, message: "调用地址长度不能超过 500" }
          ]}
        >
          <Input
            placeholder="例如：https://api.openai.com/v1"
            disabled={isBusy}
            autoComplete="off"
          />
        </Form.Item>

        <Form.Item
          name="model"
          label="模型名称"
          rules={[
            { required: true, message: "请输入模型名称" },
            { max: 200, message: "模型名称长度不能超过 200" }
          ]}
        >
          <Input
            placeholder="例如：gpt-4.1-mini / claude-3.7-sonnet"
            disabled={isBusy}
            autoComplete="off"
          />
        </Form.Item>

        <Form.Item
          name="mode"
          label="Provider 类型"
          rules={[{ required: true, message: "请选择 Provider 类型" }]}
        >
          <Select
            disabled={isBusy}
            options={[
              { value: "chat_completions", label: "Chat Completions" },
              { value: "responses", label: "Responses" },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="apiKey"
          label="API Key"
          extra={
            config?.hasApiKey ? (
              <Text type="secondary">
                当前已保存：{config.maskedApiKey ?? "已配置"}。留空表示继续使用当前 Key。
              </Text>
            ) : (
              "首次保存必须填写 API Key。"
            )
          }
          rules={config?.hasApiKey ? [] : [{ required: true, message: "请输入 API Key" }]}
        >
          <Input.Password
            placeholder={config?.hasApiKey ? "留空则保持当前 Key" : "请输入 API Key"}
            disabled={isBusy}
            autoComplete="new-password"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

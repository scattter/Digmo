"use client";

import { useEffect, useState } from "react";
import { Alert, App, Form, Input, Modal, Spin, Typography } from "antd";
import { DecisionAiOriginsConfig, fetchDecisionAiOrigins, updateDecisionAiOrigins } from "@/lib/api";

interface DecisionAiOriginsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DecisionAiOriginsDialog({ open, onOpenChange }: DecisionAiOriginsDialogProps) {
  const [form] = Form.useForm<{ origins: string }>();
  const { message } = App.useApp();
  const [config, setConfig] = useState<DecisionAiOriginsConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setConfig(null);
    setErrorText("");
    setIsLoading(true);
    form.resetFields();
    void fetchDecisionAiOrigins()
      .then((nextConfig) => {
        if (!active) return;
        setConfig(nextConfig);
        form.setFieldsValue({ origins: nextConfig.allowedOrigins.join("\n") });
      })
      .catch((error: unknown) => {
        if (active) setErrorText(error instanceof Error ? error.message : "读取 AI 服务白名单失败");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [open, form]);

  async function handleSave(values: { origins?: string }) {
    if (!config || isLoading || isSaving) return;
    setIsSaving(true);
    setErrorText("");
    try {
      const origins = (values.origins ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      await updateDecisionAiOrigins(origins);
      message.success("AI 服务白名单已保存");
      onOpenChange(false);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "保存 AI 服务白名单失败");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title="AI 服务白名单"
      open={open}
      onOk={() => form.submit()}
      onCancel={() => onOpenChange(false)}
      okText="保存白名单"
      cancelText="取消"
      confirmLoading={isSaving}
      okButtonProps={{ disabled: !config || isLoading }}
      cancelButtonProps={{ disabled: isSaving }}
      closable={!isSaving}
      mask={{ closable: !isSaving }}
      keyboard={!isSaving}
      forceRender
      centered
    >
      <Typography.Paragraph type="secondary">
        生产环境中，名单对所有用户生效。删除地址后，使用该地址的已有 AI 配置也将无法调用。
      </Typography.Paragraph>
      {config && !config.enforced ? (
        <Alert type="info" showIcon title="当前为开发环境，不校验 AI 服务白名单。" style={{ marginBottom: 16 }} />
      ) : null}
      {errorText ? <Alert type="error" showIcon title={errorText} style={{ marginBottom: 16 }} /> : null}
      <Spin spinning={isLoading}>
        <Form form={form} layout="vertical" name="decision_ai_origins_form" onFinish={handleSave} disabled={isLoading || isSaving || !config}>
          <Form.Item
            name="origins"
            label="允许调用的服务地址"
            extra="每行一个 HTTPS 地址，可包含端口，不填写 /v1 等路径。清空后将禁止所有 AI 服务调用。"
          >
            <Input.TextArea rows={7} placeholder="https://api.openai.com" />
          </Form.Item>
        </Form>
      </Spin>
    </Modal>
  );
}

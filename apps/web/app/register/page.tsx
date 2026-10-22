"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Card, Form, Input, Typography } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { fetchMe, register } from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/auth-session";

const { Title, Text } = Typography;

interface RegisterValues {
  username: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { message } = App.useApp();

  useEffect(() => {
    if (!getAccessToken()) {
      return;
    }

    void fetchMe()
      .then(() => router.replace("/"))
      .catch(() => clearAccessToken());
  }, [router]);

  async function onFinish(values: RegisterValues) {
    setIsSubmitting(true);
    try {
      await register(values.username.trim(), values.password.trim());
      message.success("注册成功，请登录");
      router.replace("/login");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "注册失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Title level={3}>注册 Digmo</Title>
          <Text type="secondary">创建账号，登录后开始管理你的基金组合</Text>
        </div>

        <Form<RegisterValues> name="register_form" onFinish={onFinish} layout="vertical" size="large">
          <Form.Item
            name="username"
            label="用户名"
            extra="3–32 位字母、数字、下划线或短横线"
            rules={[
              { required: true, whitespace: true, message: "请输入用户名" },
              {
                pattern: /^[A-Za-z0-9_-]{3,32}$/,
                transform: (value: string) => value?.trim(),
                message: "用户名需为 3–32 位字母、数字、下划线或短横线"
              }
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" disabled={isSubmitting} />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            extra="12–128 个字符，首尾空格不计入密码"
            rules={[
              { required: true, whitespace: true, message: "请输入密码" },
              {
                validator(_, value: string | undefined) {
                  const length = value?.trim().length ?? 0;
                  return !value || (length >= 12 && length <= 128)
                    ? Promise.resolve()
                    : Promise.reject(new Error("密码需为 12–128 个字符"));
                }
              }
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="new-password" disabled={isSubmitting} />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认密码"
            dependencies={["password"]}
            rules={[
              { required: true, whitespace: true, message: "请再次输入密码" },
              ({ getFieldValue }) => ({
                validator(_, value: string | undefined) {
                  return value?.trim() === getFieldValue("password")?.trim()
                    ? Promise.resolve()
                    : Promise.reject(new Error("两次输入的密码不一致"));
                }
              })
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="再次输入密码" autoComplete="new-password" disabled={isSubmitting} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={isSubmitting}>注册</Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: "center" }}>
          <Text type="secondary">已有账号？</Text> <Link href="/login">去登录</Link>
        </div>
      </Card>
    </main>
  );
}

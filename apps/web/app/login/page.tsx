"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Form, Input, Typography, App } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { fetchMe, login } from "@/lib/api";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/auth-session";

const { Title, Text } = Typography;

export default function LoginPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { message } = App.useApp();

  useEffect(() => {
    const existingToken = getAccessToken();
    if (!existingToken) {
      return;
    }

    void fetchMe()
      .then(() => {
        router.replace("/");
      })
      .catch(() => {
        clearAccessToken();
      });
  }, [router]);

  async function onFinish(values: any) {
    const { username, password } = values;
    setIsSubmitting(true);
    try {
      const payload = await login(username, password);
      setAccessToken(payload.accessToken);
      message.success("登录成功");
      router.replace("/");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "登录失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
           <Title level={3}>登录 Digmo</Title>
           <Text type="secondary">请输入用户名与密码，新用户可先注册</Text>
        </div>
        
        <Form
           name="login_form"
           onFinish={onFinish}
           layout="vertical"
           size="large"
        >
           <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
           >
              <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" disabled={isSubmitting} />
           </Form.Item>

           <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
           >
              <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" disabled={isSubmitting} />
           </Form.Item>

           <Form.Item>
              <Button type="primary" htmlType="submit" block loading={isSubmitting}>
                 登录
              </Button>
           </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          <Text type="secondary">还没有账号？</Text> <Link href="/register">立即注册</Link>
        </div>
      </Card>
    </main>
  );
}

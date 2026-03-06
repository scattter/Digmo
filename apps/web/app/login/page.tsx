"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchMe, login } from "@/lib/api";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/auth-session";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText("");

    const normalizedUsername = username.trim();
    const normalizedPassword = password.trim();
    if (!normalizedUsername || !normalizedPassword) {
      setErrorText("请输入用户名和密码");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = await login(normalizedUsername, normalizedPassword);
      setAccessToken(payload.accessToken);
      router.replace("/");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "登录失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>登录 Digmo</CardTitle>
          <CardDescription>请输入管理员创建的用户名与密码</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="username">
                用户名
              </label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="请输入用户名"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="password">
                密码
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                disabled={isSubmitting}
              />
            </div>
            {errorText ? <p className="text-sm text-red-600">{errorText}</p> : null}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "登录中..." : "登录"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

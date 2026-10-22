import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { UiModeProvider } from "@/hooks/use-ui-mode";
import { AntdConfigProvider } from "@/components/antd-config-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digmo 基金组合与盘中估值",
  description: "管理基金组合与持仓，查看盘中估值、交易记录和收益分析。盘中估值仅供参考，不等同官方净值。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AntdRegistry>
          <UiModeProvider>
            <AntdConfigProvider>
              {children}
            </AntdConfigProvider>
          </UiModeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}

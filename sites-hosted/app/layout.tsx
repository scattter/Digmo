import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { UiModeProvider } from "@/hooks/use-ui-mode";
import { AntdConfigProvider } from "@/components/antd-config-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digmo 盘中估值",
  description: "场外基金实时估值查询"
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

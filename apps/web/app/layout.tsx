import type { Metadata } from "next";
import { Toaster } from "sonner";
import { UiModeProvider } from "@/hooks/use-ui-mode";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digmo 盘中估值",
  description: "场外基金实时估值查询"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <a href="#main-content" className="skip-link">
          跳转到主要内容
        </a>
        <UiModeProvider>
          {children}
          <Toaster richColors closeButton position="top-center" />
        </UiModeProvider>
      </body>
    </html>
  );
}

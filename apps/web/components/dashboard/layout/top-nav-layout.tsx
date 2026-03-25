"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layout, Avatar, Dropdown, theme } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  WalletOutlined,
  PlusOutlined,
  ImportOutlined,
  SettingOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { DraggableTabList, TabItem } from "../navigation/draggable-tab-list";
import { DragEndEvent } from "@dnd-kit/core";
import { formatCurrency, formatSignedAmount } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-is-mobile";

const { Header, Content } = Layout;

interface HeaderSummaryBar {
  totalAmount: number;
  intradayProfitAmount?: number;
}

interface TopNavLayoutProps {
  children: React.ReactNode;
  username?: string;
  onOpenDecisionAiConfig?: () => void;
  onLogout?: () => void;
  onRefresh: () => void | Promise<void>;
  isRefreshing?: boolean;
  isRefreshDisabled?: boolean;
  onCreatePortfolio: () => void;
  onImportPortfolio: () => void;
  summaryBar: HeaderSummaryBar;
  tabs: TabItem[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  onTabDragEnd: (event: DragEndEvent) => void;
}

export function TopNavLayout({
  children,
  username,
  onOpenDecisionAiConfig,
  onLogout,
  onRefresh,
  isRefreshing = false,
  isRefreshDisabled = false,
  onCreatePortfolio,
  onImportPortfolio,
  summaryBar,
  tabs,
  activeTabId,
  onTabChange,
  onTabDragEnd,
}: TopNavLayoutProps) {
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();
  const isMobile = useIsMobile();
  const desktopTabListRef = useRef<HTMLDivElement | null>(null);
  const [shouldInlineImport, setShouldInlineImport] = useState(isMobile);
  const tabsSignature = useMemo(() => tabs.map((tab) => tab.id).join("|"), [tabs]);

  const intradayToneClass =
    typeof summaryBar.intradayProfitAmount === "number" && summaryBar.intradayProfitAmount > 0
      ? "text-red-500"
      : typeof summaryBar.intradayProfitAmount === "number" && summaryBar.intradayProfitAmount < 0
        ? "text-green-500"
        : "text-gray-500";
  const actionButtonClass =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";

  useEffect(() => {
    if (isMobile) {
      setShouldInlineImport(true);
      return;
    }

    const element = desktopTabListRef.current;
    if (!element) {
      setShouldInlineImport(false);
      return;
    }

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setShouldInlineImport(element.scrollWidth > element.clientWidth + 1);
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isMobile, tabsSignature, activeTabId]);

  const importButton = (
    <button
      type="button"
      aria-label="导入组合"
      onClick={onImportPortfolio}
      className={actionButtonClass}
    >
      <ImportOutlined />
    </button>
  );

  const userMenu = {
    items: [
      {
        key: "decision-ai-config",
        icon: <SettingOutlined />,
        label: "AI 模型配置",
        onClick: onOpenDecisionAiConfig,
      },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "退出登录",
        onClick: onLogout,
      },
    ],
  };

  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <Header
        style={{
          zIndex: 10,
          padding: 0,
          background: colorBgContainer,
          display: "flex",
          flexDirection: "column",
          height: "auto",
          lineHeight: "normal",
          borderBottom: "1px solid #f0f0f0",
          flexShrink: 0,
        }}
      >
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <WalletOutlined style={{ fontSize: 24, color: "#1677ff" }} />
            <span className="text-lg font-bold">Digmo</span>
          </div>
          <div className="flex items-center gap-4">
             {username && (
                <div className="flex items-center gap-2">
                   <span className="hidden md:inline text-sm text-gray-500">{username}</span>
                   <Dropdown menu={userMenu}>
                      <Avatar icon={<UserOutlined />} style={{ cursor: 'pointer', backgroundColor: '#fde3cf', color: '#f56a00' }} />
                   </Dropdown>
                </div>
             )}
          </div>
        </div>

        <div className="border-t border-gray-100">
          <div className="flex items-center gap-2 px-4 py-2 md:hidden">
            <div className="min-w-0 flex-1">
              <DraggableTabList
                items={tabs}
                activeId={activeTabId}
                onChange={onTabChange}
                onDragEnd={onTabDragEnd}
                className="w-full gap-1"
                endSlot={importButton}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="刷新数据"
                title="刷新数据"
                onClick={() => void onRefresh()}
                disabled={isRefreshDisabled}
                className={actionButtonClass}
              >
                <ReloadOutlined className={isRefreshing ? "animate-spin" : undefined} />
              </button>
              <button
                type="button"
                aria-label="创建组合"
                onClick={onCreatePortfolio}
                className={actionButtonClass}
              >
                <PlusOutlined />
              </button>
            </div>
          </div>

          <div className="hidden items-center gap-2 px-4 py-2 md:flex">
            <DraggableTabList
              containerRef={desktopTabListRef}
              items={tabs}
              activeId={activeTabId}
              onChange={onTabChange}
              onDragEnd={onTabDragEnd}
              className="min-w-0 flex-1 gap-1"
              endSlot={shouldInlineImport ? importButton : undefined}
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="刷新数据"
                title="刷新数据"
                onClick={() => void onRefresh()}
                disabled={isRefreshDisabled}
                className={actionButtonClass}
              >
                <ReloadOutlined className={isRefreshing ? "animate-spin" : undefined} />
              </button>
              {!shouldInlineImport ? importButton : null}
              <button
                type="button"
                aria-label="创建组合"
                onClick={onCreatePortfolio}
                className={actionButtonClass}
              >
                <PlusOutlined />
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 px-4 py-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-gray-500">资产总额</p>
              <p className="mt-1 text-2xl font-semibold leading-none text-[#2f3254]">
                {formatCurrency(summaryBar.totalAmount)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">当日收益</p>
              <p className={`mt-1 text-2xl font-semibold leading-none ${intradayToneClass}`}>
                {formatSignedAmount(summaryBar.intradayProfitAmount)}
              </p>
            </div>
          </div>
        </div>
      </Header>
      
      <Content style={{ padding: "16px 8px", overflowY: "auto", minHeight: 0 }}>
         <div
            style={{
               background: colorBgContainer,
               minHeight: "100%",
               borderRadius: borderRadiusLG,
            }}
         >
            {children}
         </div>
      </Content>
    </Layout>
  );
}

"use client";

import { Layout, Avatar, Dropdown, theme } from "antd";
import { UserOutlined, LogoutOutlined, WalletOutlined, PlusOutlined } from "@ant-design/icons";
import { DraggableTabList, TabItem } from "../navigation/draggable-tab-list";
import { DragEndEvent } from "@dnd-kit/core";
import { formatCurrency, formatSignedAmount } from "@/lib/format";

const { Header, Content } = Layout;

interface HeaderSummaryBar {
  totalAmount: number;
  intradayProfitAmount: number;
}

interface TopNavLayoutProps {
  children: React.ReactNode;
  username?: string;
  onLogout?: () => void;
  onCreatePortfolio: () => void;
  summaryBar: HeaderSummaryBar;
  tabs: TabItem[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  onTabDragEnd: (event: DragEndEvent) => void;
}

export function TopNavLayout({
  children,
  username,
  onLogout,
  onCreatePortfolio,
  summaryBar,
  tabs,
  activeTabId,
  onTabChange,
  onTabDragEnd,
}: TopNavLayoutProps) {
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const intradayToneClass =
    summaryBar.intradayProfitAmount > 0
      ? "text-red-500"
      : summaryBar.intradayProfitAmount < 0
        ? "text-green-500"
        : "text-gray-500";

  const userMenu = {
    items: [
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
          <div className="px-4 py-2 md:hidden">
            <DraggableTabList
              items={tabs}
              activeId={activeTabId}
              onChange={onTabChange}
              onDragEnd={onTabDragEnd}
              className="w-full gap-1"
              mobileEndSlot={
                <button
                  type="button"
                  aria-label="创建组合"
                  onClick={onCreatePortfolio}
                  className="h-8 w-8 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                >
                  <PlusOutlined />
                </button>
              }
            />
          </div>

          <div className="hidden items-center gap-2 px-4 py-2 md:flex">
            <DraggableTabList
              items={tabs}
              activeId={activeTabId}
              onChange={onTabChange}
              onDragEnd={onTabDragEnd}
              className="min-w-0 flex-1 gap-1"
            />
            <button
              type="button"
              aria-label="创建组合"
              onClick={onCreatePortfolio}
              className="h-8 w-8 shrink-0 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              <PlusOutlined />
            </button>
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

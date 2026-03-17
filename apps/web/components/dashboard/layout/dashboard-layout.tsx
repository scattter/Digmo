"use client";

import React, { useState } from "react";
import { Layout, Menu, Button, Drawer, Breadcrumb, Avatar, Dropdown, theme, Typography } from "antd";
import {
  DashboardOutlined,
  WalletOutlined,
  BarChartOutlined,
  MenuOutlined,
  UserOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { MenuProps } from "antd";
import type { LandingSection } from "@/hooks/use-dashboard-data";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface DashboardLayoutProps {
  children: React.ReactNode;
  username?: string;
  onLogout?: () => void;
}

const navItems = [
  {
    key: "overview",
    label: "概览",
    href: "/?section=overview",
    icon: <DashboardOutlined />,
    section: "overview" as LandingSection,
  },
  {
    key: "portfolios",
    label: "基金组合",
    href: "/?section=portfolios",
    icon: <WalletOutlined />,
    section: "portfolios" as LandingSection,
  },
  {
    key: "funds",
    label: "基金列表",
    href: "/?section=funds",
    icon: <BarChartOutlined />,
    section: "funds" as LandingSection,
  },
];

function mapLegacyViewToSection(viewParam: string | null): LandingSection {
  if (viewParam === "portfolios") return "portfolios";
  if (viewParam === "funds") return "funds";
  if (viewParam === "analysis") return "funds";
  return "overview";
}

export function DashboardLayout({
  children,
  username,
  onLogout,
}: DashboardLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const viewParam = searchParams.get("view");

  const currentSection = navItems.some((item) => item.section === sectionParam)
    ? (sectionParam as LandingSection)
    : sectionParam === "holdings"
      ? "funds"
    : navItems.some((item) => item.section === viewParam)
      ? (viewParam as LandingSection)
      : mapLegacyViewToSection(viewParam);

  const activeNavItem = navItems.find((item) => item.section === currentSection) ?? navItems[0];
  const selectedKeys = [activeNavItem.key];

  const breadcrumbTitle = activeNavItem.label;

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const menuItems: MenuProps["items"] = navItems.map((item) => ({
    key: item.key,
    icon: item.icon,
    label: <Link href={item.href}>{item.label}</Link>,
  }));

  const userMenu: MenuProps = {
    items: [
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "退出登录",
        onClick: onLogout,
      },
    ],
  };

  const SidebarContent = (
    <>
      <div style={{ height: 64, margin: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <WalletOutlined style={{ fontSize: 24, color: "#1677ff" }} />
        <span style={{ fontSize: 18, fontWeight: "bold" }}>Digmo</span>
      </div>
      <Menu
        theme="light"
        mode="inline"
        selectedKeys={selectedKeys}
        items={menuItems}
        style={{ borderRight: 0 }}
        onClick={() => setMobileOpen(false)}
      />
      <div style={{ marginTop: "auto", padding: 16 }}>
        {username && (
           <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px', border: '1px solid #f0f0f0', borderRadius: 8 }}>
              <Avatar style={{ backgroundColor: '#fde3cf', color: '#f56a00' }}>{username[0]?.toUpperCase()}</Avatar>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <Text strong style={{ fontSize: 12 }}>{username}</Text>
                  <Button type="link" size="small" onClick={onLogout} style={{ padding: 0, height: 'auto', textAlign: 'left' }} danger>
                      退出
                  </Button>
              </div>
           </div>
        )}
      </div>
    </>
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {/* Mobile Drawer */}
      <Drawer
        placement="left"
        onClose={() => setMobileOpen(false)}
        open={mobileOpen}
        styles={{ body: { padding: 0 } }}
        width={240}
      >
        {SidebarContent}
      </Drawer>

      {/* Desktop Sider */}
      <Sider
        breakpoint="md"
        collapsedWidth="0"
        onBreakpoint={(broken) => {
          // You can handle breakpoint changes here if needed
        }}
        trigger={null}
        width={240}
        theme="light"
        style={{
          display: "none", // Hidden by default, shown via media query in real CSS or conditional rendering
          // But Antd Sider handles responsive hiding if we use `breakpoint`. 
          // However, we want a custom implementation often.
          // Let's rely on standard CSS media queries or conditional rendering.
        }}
        className="hidden md:block" // Tailwind class to show on md+
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
           {SidebarContent}
        </div>
      </Sider>

      <Layout>
        <Header style={{ padding: '0 16px', background: colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
             <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setMobileOpen(true)}
                className="md:hidden" // Tailwind class to hide on desktop
                style={{ fontSize: '16px', width: 64, height: 64 }}
             />
              <Breadcrumb
                items={[
                  { title: <Link href="/">首页</Link> },
                  { title: breadcrumbTitle },
                ]}
                className="hidden md:flex"
             />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center' }}>
             {/* User Profile for Header (Mobile/Tablet usually) */}
             <div className="md:hidden">
                <Dropdown menu={userMenu}>
                   <Avatar icon={<UserOutlined />} style={{ cursor: 'pointer' }} />
                </Dropdown>
             </div>
          </div>
        </Header>
        
        <Content style={{ margin: '16px 16px', overflow: 'initial' }}>
          <div
            style={{
              padding: 12,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
            }}
          >
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

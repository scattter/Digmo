"use client";

import {
  BarChart3,
  ChevronRight,
  LayoutDashboard,
  Menu,
  PieChart,
  Settings,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ReactNode, useState } from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
  username?: string;
  onLogout?: () => void;
}

const navItems = [
  {
    title: "概览",
    href: "/",
    icon: LayoutDashboard,
    view: "overview",
  },
  {
    title: "基金组合",
    href: "/?view=portfolios",
    icon: Wallet,
    view: "portfolios",
  },
  {
    title: "基金列表",
    href: "/?view=funds",
    icon: BarChart3,
    view: "funds",
  },
  {
    title: "分析报表",
    href: "/?view=analysis",
    icon: PieChart,
    view: "analysis",
  },
];

export function DashboardLayout({
  children,
  username,
  onLogout,
}: DashboardLayoutProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const currentView = navItems.some((item) => item.view === viewParam)
    ? viewParam
    : pathname.startsWith("/funds/")
      ? "funds"
      : "overview";
  const activeNavItem =
    navItems.find((item) => item.view === currentView) ?? navItems[0];
  // In a real app, we might use useSearchParams to determine active item
  // For now, we'll just highlight based on simple logic or let the parent handle it
  // But since the original app uses state for views, we might need to expose the navigation action.
  // However, the original app is a single page dashboard.
  // We will keep it single page for now but simulate navigation or pass props.
  // Wait, the original `FundDashboard` uses `dashboard.mainView` state.
  // This Layout component wraps the dashboard content.
  // The navigation should probably control that state.
  
  // Actually, to make this reusable, we should just provide the shell structure.
  // The `navItems` hrefs are just placeholders if we are using client-side state.
  // But to improve UX, we should probably use URL params eventually.
  
  return (
    <div className="flex h-screen overflow-hidden flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4 md:hidden">
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-ml-2">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[240px] sm:w-[280px]">
            <nav className="grid gap-2 text-lg font-medium">
              <Link
                href="#"
                className="flex items-center gap-2 text-lg font-semibold"
                onClick={() => setIsMobileOpen(false)}
              >
                <Wallet className="h-6 w-6" />
                <span className="sr-only">Digmo</span>
                Digmo 基金助手
              </Link>
              {navItems.map((item, index) => (
                <Link
                  key={index}
                  href={item.href}
                  className={cn(
                    "mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 transition-colors",
                    item.view === activeNavItem.view
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setIsMobileOpen(false)}
                >
                  <item.icon className="h-5 w-5" />
                  {item.title}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
        <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
          <span className="font-semibold">Digmo</span>
        </div>
        <UserNav username={username} onLogout={onLogout} />
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden h-screen w-[180px] shrink-0 flex-col border-r bg-muted/40 md:sticky md:top-0 md:flex">
        <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Wallet className="h-6 w-6" />
            <span className="">Digmo</span>
          </Link>
        </div>
        <div className="flex-1">
          <nav className="grid items-start gap-1 px-2 py-2 text-sm font-medium lg:px-4">
            {navItems.map((item, index) => (
              <Link
                key={index}
                href={item.href}
                className={cn(
                  "mx-1 my-0.5 flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
                  item.view === activeNavItem.view
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-primary"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-4">
           {/* User Profile at bottom or settings */}
           <div className="flex items-center gap-3 rounded-lg border bg-background p-3 shadow-sm">
             <UserNav username={username} onLogout={onLogout} showName />
           </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Desktop Header / Breadcrumb */}
        <header className="hidden h-14 shrink-0 items-center gap-4 border-b bg-muted/40 px-6 md:sticky md:top-0 md:z-40 md:flex lg:h-[60px]">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">首页</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="h-3.5 w-3.5" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>{activeNavItem.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-4">
            {/* Could put global search or notifications here */}
          </div>
        </header>
        
        <main
          id="main-content"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 lg:gap-6 lg:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function UserNav({ username, onLogout, showName }: { username?: string; onLogout?: () => void; showName?: boolean }) {
  if (!username) return null;
  
  return (
    <div className="flex items-center gap-2 ml-auto md:ml-0">
      <Avatar className="h-8 w-8">
        <AvatarImage src={`https://avatar.vercel.sh/${username}`} alt={username} />
        <AvatarFallback>{username[0].toUpperCase()}</AvatarFallback>
      </Avatar>
      {showName && (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{username}</span>
          <button onClick={onLogout} className="text-xs text-muted-foreground hover:underline text-left">
            退出登录
          </button>
        </div>
      )}
      {!showName && (
         <Button variant="ghost" size="icon" onClick={onLogout} title="退出登录">
           <span className="sr-only">退出登录</span>
           <Settings className="h-4 w-4" />
         </Button>
      )}
    </div>
  );
}

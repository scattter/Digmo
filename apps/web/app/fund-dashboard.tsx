"use client";

import {
  AuthUser,
  PortfolioSummary,
  PortfolioType,
  PortfolioFundItem
} from "@digmo/shared";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { App, Spin } from "antd";
import { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { TopNavLayout } from "@/components/dashboard/layout/top-nav-layout";
import { AccountSummaryView } from "@/components/dashboard/views/account-summary-view";
import { PortfolioDetailView } from "@/components/dashboard/views/portfolio-detail-view";

import { CreatePortfolioDialog } from "@/components/dashboard/dialogs/create-portfolio-dialog";
import { FlatAddFundDialog } from "@/components/dashboard/dialogs/flat-add-fund-dialog";
import { ImportPortfolioDialog } from "@/components/dashboard/dialogs/import-portfolio-dialog";
import { SharePortfolioDialog } from "@/components/dashboard/dialogs/share-portfolio-dialog";

import { FlatFundsTable } from "@/components/dashboard/features/funds/flat-funds-table";

import { useDashboardData } from "@/hooks/use-dashboard-data";
import { FundEditState } from "@/lib/format";
import { usePortfolioActions } from "@/hooks/use-portfolio-actions";
import {
  fetchMe,
  fetchPortfolioTabLayout,
  getAuthRequiredEventName,
  reorderPortfolios,
  updatePortfolioTabLayout
} from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/auth-session";
import { TabItem } from "@/components/dashboard/navigation/draggable-tab-list";

const renameSchema = z
  .string()
  .min(1, "请输入新的组合名称")
  .max(32, "组合名称长度不能超过 32");
const GLOBAL_LOADING_TEXT_COLOR = "#1677ff";

export default function FundDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isInitialDashboardLoading, setIsInitialDashboardLoading] = useState(true);
  const authRequiredEventName = getAuthRequiredEventName();
  const { modal, message } = App.useApp();

  // Dashboard Data Hook
  const dashboard = useDashboardData();

  // Local state for tabs
  const [activeTabId, setActiveTabId] = useState("summary");
  
  // Dialog states
  const [isCreatePortfolioDialogOpen, setIsCreatePortfolioDialogOpen] = useState(false);
  const [isFlatAddFundDialogOpen, setIsFlatAddFundDialogOpen] = useState(false);
  const [isImportPortfolioDialogOpen, setIsImportPortfolioDialogOpen] = useState(false);
  const [isSharePortfolioDialogOpen, setIsSharePortfolioDialogOpen] = useState(false);

  const computeIntradayProfitAmount = (totalAmount: number, intradayEstimatePct: number) =>
    totalAmount - totalAmount / (1 + intradayEstimatePct);

  const accountSummaryBar = useMemo(() => {
    return dashboard.portfolios.reduce(
      (acc, portfolio) => {
        const intradayProfitAmount = computeIntradayProfitAmount(
          portfolio.totalAmount,
          portfolio.intradayEstimatePct
        );
        acc.totalAmount += portfolio.totalAmount;
        acc.intradayProfitAmount += intradayProfitAmount;
        return acc;
      },
      { totalAmount: 0, intradayProfitAmount: 0 }
    );
  }, [dashboard.portfolios]);

  const activeSummaryBar = useMemo(() => {
    if (activeTabId === "summary" || activeTabId === "funds") {
      return accountSummaryBar;
    }
    const portfolio = dashboard.portfolios.find((item) => item.id === activeTabId);
    if (!portfolio) {
      return accountSummaryBar;
    }
    return {
      totalAmount: portfolio.totalAmount,
      intradayProfitAmount: computeIntradayProfitAmount(
        portfolio.totalAmount,
        portfolio.intradayEstimatePct
      )
    };
  }, [activeTabId, accountSummaryBar, dashboard.portfolios]);

  // Auth Check
  useEffect(() => {
    let active = true;
    const jumpToLogin = () => {
      clearAccessToken();
      if (!active) return;
      setIsAuthChecking(false);
      router.replace("/login");
    };

    const onAuthRequired = () => jumpToLogin();
    window.addEventListener(authRequiredEventName, onAuthRequired);

    const token = getAccessToken();
    if (!token) {
      jumpToLogin();
      return () => {
        active = false;
        window.removeEventListener(authRequiredEventName, onAuthRequired);
      };
    }

    void fetchMe()
      .then(({ user }) => {
        if (!active) return;
        setCurrentUser(user);
        setIsAuthChecking(false);
      })
      .catch(() => jumpToLogin());

    return () => {
      active = false;
      window.removeEventListener(authRequiredEventName, onAuthRequired);
    };
  }, [authRequiredEventName, router]);

  // Actions
  const actions = usePortfolioActions({
    refreshData: dashboard.refreshData,
    selectedPortfolioId: dashboard.selectedPortfolioId,
    setSelectedPortfolioId: dashboard.setSelectedPortfolioId,
    setIsLoading: dashboard.setIsLoading,
    setErrorText: (msg) => {
      const text = msg.trim();
      if (!text) {
        return;
      }
      message.error(text);
    },
    setStatusText: (msg) => {
      const text = msg.trim();
      if (!text) {
        return;
      }
      message.success(text);
    },
  });

  // Sync activeTabId with selectedPortfolioId
  useEffect(() => {
    if (activeTabId !== "summary" && activeTabId !== "funds") {
       if (dashboard.selectedPortfolioId !== activeTabId) {
          dashboard.setSelectedPortfolioId(activeTabId);
       }
    }
  }, [activeTabId, dashboard.selectedPortfolioId, dashboard.setSelectedPortfolioId]);

  const [fundsTabIndex, setFundsTabIndex] = useState(0);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    let active = true;
    void fetchPortfolioTabLayout()
      .then((layout) => {
        if (!active) {
          return;
        }
        const nextIndex = Math.max(0, Math.floor(layout.fundsTabIndex));
        setFundsTabIndex(nextIndex);
      })
      .catch(() => {
        // Keep default tab order when preference fetch fails.
      });

    return () => {
      active = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    if (
      !dashboard.isLoadingPortfolios &&
      !dashboard.isLoadingFlatFunds &&
      !dashboard.isLoadingPortfolioFunds
    ) {
      setIsInitialDashboardLoading(false);
    }
  }, [
    currentUser,
    dashboard.isLoadingPortfolios,
    dashboard.isLoadingFlatFunds,
    dashboard.isLoadingPortfolioFunds
  ]);

  const tabs: TabItem[] = useMemo(() => {
    const summaryTab: TabItem = { id: "summary", label: "账户汇总", canDrag: false };
    const fundsTab: TabItem = { id: "funds", label: "全部基金", canDrag: true };
    
    const portfolioTabs: TabItem[] = dashboard.portfolios.map(p => ({
       id: p.id,
       label: p.name,
       canDrag: true
    }));

    const draggable = [...portfolioTabs];
    const insertIndex = Math.max(0, Math.min(fundsTabIndex, portfolioTabs.length));
    draggable.splice(insertIndex, 0, fundsTab);

    return [summaryTab, ...draggable];
  }, [dashboard.portfolios, fundsTabIndex]);

  const activePortfolio = useMemo(
    () => dashboard.portfolios.find((item) => item.id === activeTabId),
    [dashboard.portfolios, activeTabId]
  );

  function handleTabDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const draggableIds = tabs.filter((t) => t.canDrag).map((t) => t.id);
    const oldIndex = draggableIds.indexOf(active.id as string);
    const newIndex = draggableIds.indexOf(over.id as string);

    if (oldIndex === -1 || newIndex === -1) return;

    const newOrderIds = arrayMove(draggableIds, oldIndex, newIndex);
    const newFundsIndex = newOrderIds.indexOf("funds");
    if (newFundsIndex < 0) {
      return;
    }
    const previousFundsTabIndex = fundsTabIndex;
    const isFundsTabIndexChanged = newFundsIndex !== previousFundsTabIndex;

    const oldPortfolioIds = dashboard.portfolios.map((p) => p.id);
    const newPortfolioIds = newOrderIds.filter((id) => id !== "funds");
    const isPortfolioOrderChanged = JSON.stringify(oldPortfolioIds) !== JSON.stringify(newPortfolioIds);

    if (!isFundsTabIndexChanged && !isPortfolioOrderChanged) {
      return;
    }

    if (isFundsTabIndexChanged) {
      setFundsTabIndex(newFundsIndex);
    }

    const portfolioMap = new Map(dashboard.portfolios.map((portfolio) => [portfolio.id, portfolio]));
    const nextPortfolios = newPortfolioIds
      .map((id) => portfolioMap.get(id))
      .filter((item): item is PortfolioSummary => Boolean(item));
    const previousPortfolios = dashboard.portfolios;
    if (isPortfolioOrderChanged) {
      if (nextPortfolios.length !== newPortfolioIds.length) {
        return;
      }
      dashboard.setPortfolios(nextPortfolios);
    }

    dashboard.setIsReordering(true);
    void (async () => {
      const [layoutResult, reorderResult] = await Promise.allSettled([
        isFundsTabIndexChanged ? updatePortfolioTabLayout(newFundsIndex) : Promise.resolve(),
        isPortfolioOrderChanged ? reorderPortfolios(newPortfolioIds) : Promise.resolve()
      ]);

      if (layoutResult.status === "rejected") {
        setFundsTabIndex(previousFundsTabIndex);
      }

      if (reorderResult.status === "rejected") {
        dashboard.setPortfolios(previousPortfolios);
      }

      if (layoutResult.status === "rejected" || reorderResult.status === "rejected") {
        const reason =
          layoutResult.status === "rejected"
            ? layoutResult.reason
            : reorderResult.status === "rejected"
              ? reorderResult.reason
              : undefined;
        const errorText = reason instanceof Error ? reason.message : "排序失败";
        message.error(errorText);
      }

      dashboard.setIsReordering(false);
    })();
  }

  function handleEditFieldChange(fundCode: string, key: keyof FundEditState, value: string) {
    dashboard.setEditStateMap((prev) => {
      const next = new Map(prev);
      const current = next.get(fundCode) || { holdingAmount: "", plannedRatio: "", holdingProfitAmount: "" };
      next.set(fundCode, { ...current, [key]: value });
      return next;
    });
  }

  async function handleUpdateFund(item: PortfolioFundItem) {
    const editState = dashboard.editStateMap.get(item.fundCode);
    if (!editState) return;
    await actions.updateFundAction(
      item,
      editState.holdingAmount,
      editState.plannedRatio,
      editState.holdingProfitAmount
    );
  }

  // Logout
  function handleLogout() {
    clearAccessToken();
    router.replace("/login");
  }

  // Delete Portfolio Wrapper
  function handleDeletePortfolio(portfolio: PortfolioSummary) {
    modal.confirm({
      title: "确认删除组合？",
      content: `删除后将无法恢复：${portfolio.name}`,
      okText: "确认删除",
      okType: "danger",
      cancelText: "取消",
      centered: true,
      onOk: async () => {
        await actions.deletePortfolioAction(portfolio);
        // If deleted, switch to summary
        if (activeTabId === portfolio.id) {
           setActiveTabId("summary");
        }
      }
    });
  }

  if (isAuthChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spin
          description="正在校验登录状态..."
          styles={{ description: { color: GLOBAL_LOADING_TEXT_COLOR, fontWeight: 500 } }}
        />
      </main>
    );
  }

  if (!currentUser) {
    return null;
  }

  // Determine Content
  let content = null;
  if (activeTabId === "summary") {
     content = (
        <AccountSummaryView 
          portfolios={dashboard.portfolios} 
          onSelectPortfolio={setActiveTabId} 
        />
     );
  } else if (activeTabId === "funds") {
     content = (
        <div className="p-4">
           <FlatFundsTable
              data={dashboard.flatFunds}
              expand={dashboard.flatExpand}
              onExpandChange={dashboard.setFlatExpand}
              isLoading={dashboard.isLoadingFlatFunds}
              isBusy={dashboard.isBusy}
              onRefresh={dashboard.refreshData}
           />
        </div>
     );
  } else {
     // Portfolio View
     const portfolio = dashboard.portfolios.find(p => p.id === activeTabId);
     if (portfolio) {
        content = (
           <PortfolioDetailView
              portfolio={portfolio}
              funds={dashboard.portfolioFunds}
              editStateMap={dashboard.editStateMap}
              onEditFieldChange={handleEditFieldChange}
              onUpdateFund={handleUpdateFund}
              onOperateFund={(item, input) => actions.operatePositionAction(item, input.operationType, input.amountRaw, input.bindActionOrder && input.decisionId ? { decisionId: input.decisionId, actionOrder: input.bindActionOrder } : undefined)}
              onDeleteFund={actions.deleteFundAction}
              onDragEnd={() => {}} // PortfolioFundsTable internal drag? Or fund reorder?
              // PortfolioFundsTable has internal drag for funds.
              // We need `actions` to reorder funds.
              // `usePortfolioReorder` doesn't handle fund reorder?
              // `apps/web/hooks/use-fund-reorder.ts` exists?
              // `usePortfolioReorder` handles portfolio reorder.
              // Let's check `useFundReorder`? 
              // `FundDashboard` doesn't import `useFundReorder`.
              // I should check if `useFundReorder` exists.
              onOpenAddFundDialog={() => setIsFlatAddFundDialogOpen(true)} // Wait, FlatAddFundDialog adds to *selected* portfolio?
              onOpenShareDialog={() => setIsSharePortfolioDialogOpen(true)}
              // `FlatAddFundDialog` has a portfolio select dropdown.
              // We want to pre-select the current portfolio.
              // We can pass `initialPortfolioId={activeTabId}` to it.
              onRefresh={dashboard.refreshData}
              isBusy={dashboard.isBusy}
              isLoading={dashboard.isLoadingPortfolioFunds}
           />
        );
     } else {
        content = <div className="p-4">组合不存在或已删除</div>;
     }
  }

  return (
    <>
      <Spin
        spinning={isInitialDashboardLoading}
        fullscreen
        description="正在加载数据..."
        styles={{
          root: { backgroundColor: "rgba(247, 248, 250, 0.6)" },
          section: { color: GLOBAL_LOADING_TEXT_COLOR },
          description: { color: GLOBAL_LOADING_TEXT_COLOR, fontWeight: 500, textShadow: "none" }
        }}
      />
      <TopNavLayout
        username={currentUser.username}
        onLogout={handleLogout}
        onCreatePortfolio={() => setIsCreatePortfolioDialogOpen(true)}
        onImportPortfolio={() => setIsImportPortfolioDialogOpen(true)}
        summaryBar={activeSummaryBar}
        tabs={tabs}
        activeTabId={activeTabId}
        onTabChange={setActiveTabId}
        onTabDragEnd={handleTabDragEnd}
      >
        {content}
        
        <CreatePortfolioDialog
          open={isCreatePortfolioDialogOpen}
          onOpenChange={setIsCreatePortfolioDialogOpen}
          onSubmit={async (values) => {
            await actions.createPortfolioAction(values.name, values.type as PortfolioType);
            setIsCreatePortfolioDialogOpen(false);
          }}
          isBusy={dashboard.isBusy}
        />

        <ImportPortfolioDialog
          open={isImportPortfolioDialogOpen}
          onOpenChange={setIsImportPortfolioDialogOpen}
          isBusy={dashboard.isBusy}
          onSubmit={async (values) => {
            const result = await actions.importPortfolioByShareCodeAction(values);
            setIsImportPortfolioDialogOpen(false);
            setActiveTabId(result.portfolio.id);
          }}
        />

        <SharePortfolioDialog
          open={isSharePortfolioDialogOpen}
          onOpenChange={setIsSharePortfolioDialogOpen}
          portfolioId={activePortfolio?.id}
          portfolioName={activePortfolio?.name}
          isBusy={dashboard.isBusy}
          onSubmit={(values) => actions.sharePortfolioAction(values)}
        />

        <FlatAddFundDialog
          open={isFlatAddFundDialogOpen}
          onOpenChange={setIsFlatAddFundDialogOpen}
          onSubmit={async (values) => {
             // If we are in portfolio view, maybe we want to force add to that portfolio?
             // The dialog allows selecting portfolio.
             // `values.portfolioId` comes from dialog.
            const targetPortfolio = dashboard.portfolios.find(
              (portfolio) => portfolio.id === values.portfolioId
            );
            if (!targetPortfolio) return;

            await actions.addFundAction({
              portfolioId: targetPortfolio.id,
              portfolioType: targetPortfolio.type,
              fundCode: values.fundCode,
              holdingAmount: values.holdingAmount,
              holdingProfitAmount: values.holdingProfitAmount,
              plannedRatio: values.plannedRatio ?? ""
            });
            setIsFlatAddFundDialogOpen(false);
          }}
          portfolios={dashboard.portfolios}
          isBusy={dashboard.isBusy}
          initialPortfolioId={activeTabId !== "summary" && activeTabId !== "funds" ? activeTabId : undefined}
        />
      </TopNavLayout>
    </>
  );
}

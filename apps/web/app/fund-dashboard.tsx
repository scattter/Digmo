"use client";

import {
  AuthUser,
  PortfolioSummary,
  PortfolioType,
} from "@digmo/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { App, Spin } from "antd";

import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { DashboardOverview } from "@/components/dashboard/layout/dashboard-overview";

import { CreatePortfolioDialog } from "@/components/dashboard/dialogs/create-portfolio-dialog";
import { FlatAddFundDialog } from "@/components/dashboard/dialogs/flat-add-fund-dialog";

import { FlatFundsTable } from "@/components/dashboard/features/funds/flat-funds-table";
import { PortfolioOverviewTable } from "@/components/dashboard/features/portfolios/portfolio-overview-table";
import { PortfolioToolbar } from "@/components/dashboard/features/navigation/portfolio-toolbar";

import {
  getFlatSortButtonLabel,
  type LandingSection,
  nextSortOrder,
  useDashboardData,
} from "@/hooks/use-dashboard-data";
import { usePortfolioReorder } from "@/hooks/use-portfolio-reorder";
import { usePortfolioActions } from "@/hooks/use-portfolio-actions";
import { fetchMe, getAuthRequiredEventName } from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/auth-session";

const renameSchema = z
  .string()
  .min(1, "请输入新的组合名称")
  .max(32, "组合名称长度不能超过 32");

function resolveLandingSection(
  sectionParam: string | null,
  viewParam: string | null
): LandingSection {
  if (
    sectionParam === "overview" ||
    sectionParam === "portfolios" ||
    sectionParam === "funds"
  ) {
    return sectionParam;
  }
  if (sectionParam === "holdings") return "funds";
  if (viewParam === "portfolios") return "portfolios";
  if (viewParam === "funds") return "funds";
  if (viewParam === "analysis") return "funds";
  return "overview";
}

export default function FundDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const authRequiredEventName = getAuthRequiredEventName();
  const { modal, message } = App.useApp();

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

  const dashboard = useDashboardData();
  const sectionParam = searchParams.get("section");
  const viewParam = searchParams.get("view");
  const activeSection = useMemo(
    () => resolveLandingSection(sectionParam, viewParam),
    [sectionParam, viewParam]
  );
  const sectionRefs = useRef<Record<LandingSection, HTMLDivElement | null>>({
    overview: null,
    portfolios: null,
    funds: null,
  });

  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
  const [editingPortfolioName, setEditingPortfolioName] = useState("");

  const [isCreatePortfolioDialogOpen, setIsCreatePortfolioDialogOpen] = useState(false);
  const [isFlatAddFundDialogOpen, setIsFlatAddFundDialogOpen] = useState(false);

  const actions = usePortfolioActions({
    refreshData: dashboard.refreshData,
    selectedPortfolioId: dashboard.selectedPortfolioId,
    setSelectedPortfolioId: dashboard.setSelectedPortfolioId,
    setIsLoading: dashboard.setIsLoading,
    setErrorText: (msg) => message.error(msg),
    setStatusText: (msg) => message.success(msg),
  });

  const portfolioReorder = usePortfolioReorder({
    portfolios: dashboard.portfolios,
    setPortfolios: dashboard.setPortfolios,
    setIsReordering: dashboard.setIsReordering,
    setErrorText: (msg) => message.error(msg),
    setStatusText: (msg) => message.success(msg),
  });

  const portfolioTotalAmount = useMemo(
    () =>
      dashboard.portfolios.reduce((sum, portfolio) => sum + portfolio.totalAmount, 0),
    [dashboard.portfolios]
  );

  const portfolioTotalProfitAmount = useMemo(
    () =>
      dashboard.portfolios.reduce(
        (sum, portfolio) => sum + portfolio.totalProfitAmount,
        0
      ),
    [dashboard.portfolios]
  );

  const portfolioTotalProfitPct = useMemo(() => {
    const totalCost = portfolioTotalAmount - portfolioTotalProfitAmount;
    if (totalCost <= 0) {
      return 0;
    }
    return Number((portfolioTotalProfitAmount / totalCost).toFixed(6));
  }, [portfolioTotalAmount, portfolioTotalProfitAmount]);

  const portfolioTotalIntradayAmount = useMemo(
    () =>
      dashboard.portfolios.reduce((sum, portfolio) => {
        const intradayPct =
          typeof portfolio.intradayEstimatePct === "number"
            ? portfolio.intradayEstimatePct
            : 0;
        return sum + portfolio.totalAmount * intradayPct;
      }, 0),
    [dashboard.portfolios]
  );

  const portfolioTotalIntradayPct = useMemo(() => {
    if (portfolioTotalAmount <= 0) {
      return 0;
    }
    return Number((portfolioTotalIntradayAmount / portfolioTotalAmount).toFixed(6));
  }, [portfolioTotalIntradayAmount, portfolioTotalAmount]);

  useEffect(() => {
    if (isAuthChecking || !currentUser) {
      return;
    }
    const target = sectionRefs.current[activeSection];
    if (!target) {
      return;
    }
    const offset = 84;
    const top = Math.max(target.offsetTop - offset, 0);
    window.scrollTo({ top, behavior: "smooth" });
  }, [activeSection, currentUser, isAuthChecking]);

  function onStartRenamePortfolio(portfolio: PortfolioSummary) {
    setEditingPortfolioId(portfolio.id);
    setEditingPortfolioName(portfolio.name);
  }

  function onCancelRenamePortfolio() {
    setEditingPortfolioId(null);
    setEditingPortfolioName("");
  }

  async function onCommitRenamePortfolio(portfolio: PortfolioSummary) {
    if (editingPortfolioId !== portfolio.id) {
      return;
    }

    const trimmedName = editingPortfolioName.trim();
    if (!trimmedName || trimmedName === portfolio.name) {
      onCancelRenamePortfolio();
      return;
    }

    const parsed = renameSchema.safeParse(trimmedName);
    if (!parsed.success) {
      message.error(parsed.error.issues[0]?.message ?? "名称不合法");
      return;
    }

    await actions.renamePortfolioAction(portfolio, parsed.data);
    onCancelRenamePortfolio();
  }

  async function handleManualRefresh() {
    await actions.manualRefreshAction(dashboard.markManualRefresh);
  }

  function handleLogout(): void {
    clearAccessToken();
    router.replace("/login");
  }

  function handleDeletePortfolio(portfolio: PortfolioSummary) {
    modal.confirm({
      title: "确认删除组合？",
      content: `删除后将无法恢复：${portfolio.name}`,
      okText: "确认删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        await actions.deletePortfolioAction(portfolio);
      }
    });
  }

  if (isAuthChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spin tip="正在校验登录状态..." />
      </main>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <DashboardLayout
      username={currentUser.username}
      onLogout={handleLogout}
    >
      <div
        className="space-y-6"
        aria-busy={dashboard.isLoading}
        style={
          dashboard.isLoading
            ? {
                opacity: 0.58,
                filter: "grayscale(0.9)",
                pointerEvents: "none",
                transition: "opacity 0.2s ease, filter 0.2s ease",
              }
            : undefined
        }
      >
        <div
          id="overview"
          ref={(node) => {
            sectionRefs.current.overview = node;
          }}
          style={{ scrollMarginTop: 84 }}
        >
          <DashboardOverview
            totalAmount={portfolioTotalAmount}
            totalProfitAmount={portfolioTotalProfitAmount}
            totalProfitPct={portfolioTotalProfitPct}
            totalIntradayAmount={portfolioTotalIntradayAmount}
            totalIntradayPct={portfolioTotalIntradayPct}
            isLoading={dashboard.isLoading}
            onAddFund={() => setIsFlatAddFundDialogOpen(true)}
            onCreatePortfolio={() => setIsCreatePortfolioDialogOpen(true)}
          />
        </div>

        <div
          id="portfolios"
          ref={(node) => {
            sectionRefs.current.portfolios = node;
          }}
          style={{ scrollMarginTop: 84 }}
        >
          <PortfolioOverviewTable
            portfolios={dashboard.portfolios}
            isLoading={dashboard.isLoadingPortfolios}
            isBusy={dashboard.isBusy}
            editingPortfolioId={editingPortfolioId}
            editingPortfolioName={editingPortfolioName}
            onDelete={handleDeletePortfolio}
            onOpen={(portfolio) => dashboard.setSelectedPortfolioId(portfolio.id)}
            onStartRename={onStartRenamePortfolio}
            onRenameInputChange={setEditingPortfolioName}
            onCommitRename={onCommitRenamePortfolio}
            onCancelRename={onCancelRenamePortfolio}
            onRefresh={handleManualRefresh}
          />
        </div>

        <div
          id="funds"
          ref={(node) => {
            sectionRefs.current.funds = node;
          }}
          style={{ scrollMarginTop: 84 }}
          className="space-y-4"
        >
          <PortfolioToolbar
            mainView="funds"
            isBusy={dashboard.isBusy}
            portfolios={dashboard.portfolios}
            selectedPortfolioId={dashboard.selectedPortfolioId}
            onSelectPortfolio={dashboard.setSelectedPortfolioId}
            flatExpand={dashboard.flatExpand}
            onFlatExpandChange={dashboard.setFlatExpand}
            onDeletePortfolioTab={handleDeletePortfolio}
            onPortfolioDragEnd={(event) =>
              portfolioReorder.onPortfolioTabsDragEnd(event, dashboard.isReordering)
            }
          />
          <FlatFundsTable
            data={dashboard.flatFunds}
            expand={dashboard.flatExpand}
            isLoading={dashboard.isLoadingFlatFunds}
            isBusy={dashboard.isBusy}
            flatSortOrder={dashboard.flatSortOrder}
            onFlatSortToggle={() => dashboard.setFlatSortOrder((prev) => nextSortOrder(prev))}
            flatSortLabel={getFlatSortButtonLabel(dashboard.flatSortOrder)}
            onRefresh={handleManualRefresh}
          />
        </div>
      </div>

      <CreatePortfolioDialog
        open={isCreatePortfolioDialogOpen}
        onOpenChange={setIsCreatePortfolioDialogOpen}
        onSubmit={async (values) => {
          await actions.createPortfolioAction(values.name, values.type as PortfolioType);
          setIsCreatePortfolioDialogOpen(false);
        }}
        isBusy={dashboard.isBusy}
      />

      <FlatAddFundDialog
        open={isFlatAddFundDialogOpen}
        onOpenChange={setIsFlatAddFundDialogOpen}
        onSubmit={async (values) => {
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
      />
    </DashboardLayout>
  );
}

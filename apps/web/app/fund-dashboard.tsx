"use client";

import {
  AuthUser,
  DailyDecision,
  DecisionDocFormat,
  PortfolioFundItem,
  PortfolioSummary,
  PortfolioType,
} from "@digmo/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import {Spin, Modal, Typography, App, Button} from "antd";

// Layout & Overview
import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { DashboardOverview } from "@/components/dashboard/layout/dashboard-overview";

// Dialogs
import { CreatePortfolioDialog } from "@/components/dashboard/dialogs/create-portfolio-dialog";
import { FlatAddFundDialog } from "@/components/dashboard/dialogs/flat-add-fund-dialog";
import { PortfolioAddFundDialog } from "@/components/dashboard/dialogs/portfolio-add-fund-dialog";
import { DecisionHistoryDialog } from "@/components/dashboard/dialogs/decision-history-dialog";

// Panels & Widgets
import { DailyDecisionPanel } from "@/components/dashboard/features/decision/daily-decision-panel";
import { EstimateAnalysisPanel } from "@/components/dashboard/features/analytics/estimate-analysis-panel";
import { RatioAnalysisPanel } from "@/components/dashboard/features/analytics/ratio-analysis-panel";

// Tables
import { FlatFundsTable } from "@/components/dashboard/features/funds/flat-funds-table";
import { PortfolioFundsTable } from "@/components/dashboard/features/portfolios/portfolio-funds-table";
import { PortfolioOverviewTable } from "@/components/dashboard/features/portfolios/portfolio-overview-table";
import { PortfolioToolbar } from "@/components/dashboard/features/navigation/portfolio-toolbar";

// Hooks & Utils
import {
  getFlatSortButtonLabel,
  nextSortOrder,
  useDashboardData,
  MainView,
} from "@/hooks/use-dashboard-data";
import { useFundReorder } from "@/hooks/use-fund-reorder";
import { usePortfolioReorder } from "@/hooks/use-portfolio-reorder";
import { usePortfolioActions } from "@/hooks/use-portfolio-actions";
import {
  fetchDailyDecisionHistory,
  fetchDecisionDoc,
  fetchLatestDailyDecision,
  fetchMe,
  generateDailyDecision,
  getAuthRequiredEventName,
  upsertDecisionDoc,
} from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/auth-session";
import { FundEditState } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-is-mobile";

const { Text } = Typography;

const renameSchema = z
  .string()
  .min(1, "请输入新的组合名称")
  .max(32, "组合名称长度不能超过 32");

function getShanghaiTradeDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
    new Date()
  );
}

export default function FundDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const isMobile = useIsMobile();
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const authRequiredEventName = getAuthRequiredEventName();
  
  // Use Ant Design App context for modal/message/notification
  const { modal, message } = App.useApp();

  // Auth Check Effect
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
  
  // Sync View from URL
  const viewParam = searchParams.get("view");
  useEffect(() => {
    if (viewParam && ["overview", "portfolios", "funds", "analysis"].includes(viewParam)) {
      dashboard.setMainView(viewParam as MainView);
    } else if (!viewParam) {
      dashboard.setMainView("overview");
    }
  }, [viewParam, dashboard.setMainView]);


  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
  const [editingPortfolioName, setEditingPortfolioName] = useState("");

  const [isCreatePortfolioDialogOpen, setIsCreatePortfolioDialogOpen] = useState(false);
  const [isFlatAddFundDialogOpen, setIsFlatAddFundDialogOpen] = useState(false);
  const [isPortfolioAddFundDialogOpen, setIsPortfolioAddFundDialogOpen] = useState(false);
  
  // Analysis Panels State
  const [isRatioPanelExpanded, setIsRatioPanelExpanded] = useState(false);
  const [isEstimatePanelExpanded, setIsEstimatePanelExpanded] = useState(false);

  // Decision State
  const [decisionDocSourceFileName, setDecisionDocSourceFileName] = useState<string | undefined>(undefined);
  const [decisionDocContent, setDecisionDocContent] = useState("");
  const [decisionDocFormat, setDecisionDocFormat] = useState<DecisionDocFormat>("TEXT");
  const [decisionDocVersion, setDecisionDocVersion] = useState<number | undefined>(undefined);
  const [latestDecision, setLatestDecision] = useState<DailyDecision | null>(null);
  const [decisionHistory, setDecisionHistory] = useState<DailyDecision[]>([]);
  const [isDecisionHistoryDialogOpen, setIsDecisionHistoryDialogOpen] = useState(false);
  const [isDecisionHistoryLoading, setIsDecisionHistoryLoading] = useState(false);
  const [isDecisionLoading, setIsDecisionLoading] = useState(false);
  const [isDecisionDocSubmitting, setIsDecisionDocSubmitting] = useState(false);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [isDecisionDrawerOpen, setIsDecisionDrawerOpen] = useState(false);

  const actions = usePortfolioActions({
    refreshData: dashboard.refreshData,
    selectedPortfolioId: dashboard.selectedPortfolioId,
    setSelectedPortfolioId: dashboard.setSelectedPortfolioId,
    setIsLoading: dashboard.setIsLoading,
    setErrorText: (msg) => message.error(msg),
    setStatusText: (msg) => message.success(msg),
  });

  const reorder = useFundReorder({
    selectedPortfolioId: dashboard.selectedPortfolioId,
    portfolioFunds: dashboard.portfolioFunds,
    setPortfolioFunds: dashboard.setPortfolioFunds,
    setIsReordering: dashboard.setIsReordering,
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

  const selectedPortfolioName = useMemo(
    () =>
      dashboard.selectedPortfolioMeta?.name ??
      dashboard.selectedPortfolioSummary?.name ??
      "当前组合",
    [dashboard.selectedPortfolioMeta?.name, dashboard.selectedPortfolioSummary?.name]
  );

  const selectedPortfolioType = useMemo(
    () =>
      (dashboard.selectedPortfolioMeta?.type ??
        dashboard.selectedPortfolioSummary?.type ??
        "FREE") as PortfolioType,
    [dashboard.selectedPortfolioMeta?.type, dashboard.selectedPortfolioSummary?.type]
  );

  const isRatioPortfolio = selectedPortfolioType === "RATIO";
  const analysisPanelHeightClass = "h-[240px] md:h-[200px]";

  const mergedRatioEstimateRows = useMemo(() => {
    const ratioByFund = new Map(
      dashboard.ratioAnalysisRows.map((row) => [row.fundCode, row] as const)
    );
    const usedFundCodes = new Set<string>();

    const merged = dashboard.estimateAnalysisRows.flatMap((estimate) => {
      const ratio = ratioByFund.get(estimate.fundCode);
      if (!ratio) {
        return [];
      }
      usedFundCodes.add(estimate.fundCode);
      return [
        {
          ...ratio,
          estimateChangePct: estimate.estimateChangePct,
          intradayAmount: estimate.intradayAmount,
        },
      ];
    });

    const rest = dashboard.ratioAnalysisRows
      .filter((row) => !usedFundCodes.has(row.fundCode))
      .map((row) => ({
        ...row,
        estimateChangePct: 0,
        intradayAmount: 0,
      }));

    return merged.concat(rest);
  }, [dashboard.estimateAnalysisRows, dashboard.ratioAnalysisRows]);

  const portfolioTotalAmount = useMemo(
    () =>
      dashboard.portfolios.reduce((sum, portfolio) => sum + portfolio.totalAmount, 0),
    [dashboard.portfolios]
  );
  
  const portfolioTotalDailyAmount = useMemo(
    () =>
      dashboard.portfolios.reduce(
        (sum, portfolio) => sum + portfolio.totalAmount * portfolio.dailyProfitPct,
        0
      ),
    [dashboard.portfolios]
  );

  const isDecisionBusy =
    dashboard.isBusy || isDecisionDocSubmitting || isGeneratingSuggestion;
  const todayInShanghai = useMemo(() => getShanghaiTradeDate(), []);
  
  const latestDecisionForBinding = useMemo(() => {
    if (!latestDecision) {
      return null;
    }
    return latestDecision.tradeDate === todayInShanghai ? latestDecision : null;
  }, [latestDecision, todayInShanghai]);

  const loadDecisionArtifacts = useCallback(
    async (portfolioId: string) => {
      setIsDecisionLoading(true);
      try {
        const [doc, latest] = await Promise.all([
          fetchDecisionDoc(portfolioId),
          fetchLatestDailyDecision(portfolioId),
        ]);
        setDecisionDocSourceFileName(doc?.sourceFileName);
        setDecisionDocContent(doc?.content ?? "");
        setDecisionDocFormat(doc?.format ?? "TEXT");
        setDecisionDocVersion(doc?.version);
        setLatestDecision(latest);
      } catch (error) {
        message.error(error instanceof Error ? error.message : "加载决策数据失败");
      } finally {
        setIsDecisionLoading(false);
      }
    },
    [message]
  );

  useEffect(() => {
    if (
      dashboard.mainView !== "portfolios" ||
      dashboard.selectedPortfolioId === "all"
    ) {
      setDecisionDocSourceFileName(undefined);
      setDecisionDocContent("");
      setDecisionDocFormat("TEXT");
      setDecisionDocVersion(undefined);
      setLatestDecision(null);
      setDecisionHistory([]);
      setIsDecisionLoading(false);
      return;
    }

    void loadDecisionArtifacts(dashboard.selectedPortfolioId);
  }, [dashboard.mainView, dashboard.selectedPortfolioId, loadDecisionArtifacts]);

  async function onUploadDecisionDoc(file: File) {
    const content = await file.text();
    const normalized = content.trim();
    if (!normalized) {
      message.error("上传文件内容为空");
      return;
    }

    setDecisionDocContent(normalized);
    setDecisionDocSourceFileName(file.name);
    const lower = file.name.toLowerCase();
    setDecisionDocFormat(
      lower.endsWith(".md") || lower.endsWith(".markdown") ? "MARKDOWN" : "TEXT"
    );
  }

  async function onSaveDecisionDoc() {
    if (dashboard.selectedPortfolioId === "all") {
      message.error("请先选择具体组合");
      return;
    }

    if (!decisionDocContent.trim()) {
      message.error("请先上传或填写策略文档");
      return;
    }

    setIsDecisionDocSubmitting(true);
    try {
      const doc = await upsertDecisionDoc({
        portfolioId: dashboard.selectedPortfolioId,
        content: decisionDocContent.trim(),
        format: decisionDocFormat,
        sourceFileName: decisionDocSourceFileName,
      });
      setDecisionDocSourceFileName(doc.sourceFileName);
      setDecisionDocContent(doc.content);
      setDecisionDocFormat(doc.format);
      setDecisionDocVersion(doc.version);
      message.success("策略文档已保存");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存策略文档失败");
    } finally {
      setIsDecisionDocSubmitting(false);
    }
  }

  async function onGenerateDecision() {
    if (dashboard.selectedPortfolioId === "all") {
      message.error("请先选择具体组合");
      return;
    }

    if (!decisionDocContent.trim()) {
      message.error("请先保存策略文档");
      return;
    }

    setIsGeneratingSuggestion(true);
    try {
      const decision = await generateDailyDecision(dashboard.selectedPortfolioId);
      setLatestDecision(decision);
      setDecisionHistory((prev) => [
        decision,
        ...prev.filter((item) => item.id !== decision.id),
      ]);
      message.success("今日建议已生成");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "生成今日建议失败");
    } finally {
      setIsGeneratingSuggestion(false);
    }
  }

  async function loadDecisionHistory(portfolioId: string) {
    setIsDecisionHistoryLoading(true);
    try {
      const history = await fetchDailyDecisionHistory(portfolioId, 100);
      setDecisionHistory(history);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载建议历史失败");
    } finally {
      setIsDecisionHistoryLoading(false);
    }
  }

  async function onOpenDecisionHistoryDialog() {
    if (dashboard.selectedPortfolioId === "all") {
      message.error("请先选择具体组合");
      return;
    }
    setIsDecisionHistoryDialogOpen(true);
    await loadDecisionHistory(dashboard.selectedPortfolioId);
  }

  function onEditFieldChange(
    fundCode: string,
    key: keyof FundEditState,
    value: string
  ) {
    dashboard.setEditStateMap((prev) => {
      const next = new Map(prev);
      const current = next.get(fundCode) ?? {
        holdingAmount: "",
        plannedRatio: "",
        holdingProfitAmount: "",
      };
      next.set(fundCode, {
        ...current,
        [key]: value,
      });
      return next;
    });
  }

  async function onUpdateFund(item: PortfolioFundItem) {
    const edit = dashboard.editStateMap.get(item.fundCode);
    if (!edit) {
      return;
    }
    await actions.updateFundAction(
      item,
      edit.holdingAmount,
      edit.plannedRatio,
      edit.holdingProfitAmount
    );
  }

  async function onOperateFund(
    item: PortfolioFundItem,
    input: {
      operationType: "INCREASE" | "DECREASE";
      amountRaw: string;
      bindActionOrder?: number;
    }
  ) {
    const bindSuggestion =
      typeof input.bindActionOrder === "number"
        ? latestDecisionForBinding
          ? {
              decisionId: latestDecisionForBinding.id,
              actionOrder: input.bindActionOrder,
            }
          : undefined
        : undefined;

    if (typeof input.bindActionOrder === "number" && !bindSuggestion) {
      message.error("当前无可绑定的今日建议");
      throw new Error("当前无可绑定的今日建议");
    }

    await actions.operatePositionAction(
      item,
      input.operationType,
      input.amountRaw,
      bindSuggestion
    );
  }

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
      title: '确认删除组合？',
      content: `删除后将无法恢复：${portfolio.name}`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await actions.deletePortfolioAction(portfolio);
      }
    });
  }

  function handleDeleteFund(fund: PortfolioFundItem) {
    modal.confirm({
      title: '确认移除基金？',
      content: `将从组合中移除基金 ${fund.fundCode}`,
      okText: '确认移除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await actions.deleteFundAction(fund);
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
      {dashboard.mainView === "overview" && (
        <DashboardOverview
          totalAmount={portfolioTotalAmount}
          totalIntradayAmount={portfolioTotalDailyAmount}
          onAddFund={() => setIsFlatAddFundDialogOpen(true)}
          onCreatePortfolio={() => setIsCreatePortfolioDialogOpen(true)}
        />
      )}

      {dashboard.mainView === "funds" && (
        <>
          <PortfolioToolbar
            mainView={dashboard.mainView}
            isBusy={dashboard.isBusy}
            portfolios={dashboard.portfolios}
            selectedPortfolioId={dashboard.selectedPortfolioId}
            onSelectPortfolio={dashboard.setSelectedPortfolioId}
            flatExpand={dashboard.flatExpand}
            onFlatExpandChange={dashboard.setFlatExpand}
            flatSortOrder={dashboard.flatSortOrder}
            onFlatSortToggle={() => dashboard.setFlatSortOrder((prev) => nextSortOrder(prev))}
            flatSortLabel={getFlatSortButtonLabel(dashboard.flatSortOrder)}
            onDeletePortfolioTab={handleDeletePortfolio}
            onPortfolioDragEnd={(event) => portfolioReorder.onPortfolioTabsDragEnd(event, dashboard.isReordering)}
          />
          <FlatFundsTable
            data={dashboard.flatFunds}
            expand={dashboard.flatExpand}
            isLoading={dashboard.isLoadingFlatFunds}
            isBusy={dashboard.isBusy}
            onRefresh={handleManualRefresh}
          />
        </>
      )}

      {dashboard.mainView === "portfolios" && (
        <>
           {dashboard.selectedPortfolioId === "all" ? (
             <div className="space-y-4">
               <PortfolioToolbar
                  mainView={dashboard.mainView}
                  isBusy={dashboard.isBusy}
                  portfolios={dashboard.portfolios}
                  selectedPortfolioId={dashboard.selectedPortfolioId}
                  onSelectPortfolio={dashboard.setSelectedPortfolioId}
                  flatExpand={dashboard.flatExpand}
                  onFlatExpandChange={dashboard.setFlatExpand}
                  flatSortOrder={dashboard.flatSortOrder}
                  onFlatSortToggle={() => dashboard.setFlatSortOrder((prev) => nextSortOrder(prev))}
                  flatSortLabel={getFlatSortButtonLabel(dashboard.flatSortOrder)}
                  onDeletePortfolioTab={handleDeletePortfolio}
                  onPortfolioDragEnd={(event) => portfolioReorder.onPortfolioTabsDragEnd(event, dashboard.isReordering)}
                />
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
           ) : (
             // Specific Portfolio View
             <div className="space-y-2">
                <div style={{ marginBottom: isMobile ? 8 : 16 }}>
                    <a onClick={() => dashboard.setSelectedPortfolioId("all")} style={{ cursor: 'pointer', color: '#1677ff', fontSize: isMobile ? 14 : 16 }}>
                        ← 返回组合列表
                    </a>
                </div>
                
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="min-w-0">
                    {isRatioPortfolio ? (
                      <RatioAnalysisPanel
                        rows={mergedRatioEstimateRows}
                        sortOrder={dashboard.estimateSortOrder}
                        onToggleSort={() => dashboard.setEstimateSortOrder((prev) => nextSortOrder(prev))}
                        expanded={isRatioPanelExpanded}
                        onToggleExpanded={() => setIsRatioPanelExpanded((prev) => !prev)}
                        disabled={dashboard.isBusy}
                        className={analysisPanelHeightClass}
                      />
                    ) : (
                      <EstimateAnalysisPanel
                        rows={dashboard.estimateAnalysisRows}
                        sortOrder={dashboard.estimateSortOrder}
                        onToggleSort={() => dashboard.setEstimateSortOrder((prev) => nextSortOrder(prev))}
                        expanded={isEstimatePanelExpanded}
                        onToggleExpanded={() => setIsEstimatePanelExpanded((prev) => !prev)}
                        disabled={dashboard.isBusy}
                        compact
                        className={analysisPanelHeightClass}
                      />
                    )}
                  </div>

                  {/* Decision Panel (Mini) - Replaced with Antd Card/Button */}
                  <div className={`flex flex-col ${analysisPanelHeightClass}`} style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: isMobile ? 12 : 16 }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text strong style={{ fontSize: isMobile ? 14 : 16 }}>决策与操作</Text>
                     </div>
                     <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'pre-line' }}>
                          {latestDecision
                            ? latestDecision.summary
                            : "暂无今日建议，可在此更新建议并管理策略文档"}
                        </Text>
                     </div>
                     <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button onClick={() => void onGenerateDecision()} style={{ fontSize: 12, color: isDecisionBusy ? '#ccc' : '#1677ff', cursor: isDecisionBusy ? 'not-allowed' : 'pointer' }}>
                           更新决策
                        </Button>
                        <Button onClick={() => setIsDecisionDrawerOpen(true)} style={{ fontSize: 12, color: isDecisionBusy ? '#ccc' : '#1677ff', cursor: isDecisionBusy ? 'not-allowed' : 'pointer' }}>
                           管理文档
                        </Button>
                        <Button onClick={() => void onOpenDecisionHistoryDialog()} style={{ fontSize: 12, color: isDecisionBusy ? '#ccc' : '#1677ff', cursor: isDecisionBusy ? 'not-allowed' : 'pointer' }}>
                           操作历史
                        </Button>
                     </div>
                  </div>
                </div>

                <PortfolioFundsTable
                  portfolioName={selectedPortfolioName}
                  portfolioType={selectedPortfolioType}
                  funds={dashboard.portfolioFunds}
                  editStateMap={dashboard.editStateMap}
                  isBusy={dashboard.isBusy}
                  isLoading={dashboard.isLoadingPortfolioFunds}
                  onEditFieldChange={onEditFieldChange}
                  onUpdateFund={onUpdateFund}
                  onOperateFund={onOperateFund}
                  latestDecisionForBinding={latestDecisionForBinding}
                  onDeleteFund={handleDeleteFund}
                  onDragEnd={(event) => reorder.onPortfolioFundsDragEnd(event, dashboard.isReordering)}
                  onRefresh={handleManualRefresh}
                  onOpenAddFundDialog={() => setIsPortfolioAddFundDialogOpen(true)}
                />
             </div>
           )}
        </>
      )}

      {dashboard.mainView === "analysis" && (
        <div style={{ padding: 24, background: '#fff', borderRadius: 8, textAlign: 'center' }}>
           <Text type="secondary">V2 视图已下线，当前暂无可展示的分析内容。</Text>
        </div>
      )}

      <Modal 
         title="决策与操作" 
         open={isDecisionDrawerOpen} 
         onCancel={() => setIsDecisionDrawerOpen(false)}
         footer={null}
         width={800}
         style={{ top: 20 }}
         destroyOnClose
      >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>策略文档管理。</Text>
          <DailyDecisionPanel
            isBusy={isDecisionBusy}
            isLoading={isDecisionLoading}
            isGeneratingSuggestion={isGeneratingSuggestion}
            docContent={decisionDocContent}
            docFormat={decisionDocFormat}
            docVersion={decisionDocVersion}
            docFileName={decisionDocSourceFileName}
            onDocContentChange={setDecisionDocContent}
            onDocUpload={onUploadDecisionDoc}
            onSaveDoc={onSaveDecisionDoc}
          />
      </Modal>

      <DecisionHistoryDialog
        open={isDecisionHistoryDialogOpen}
        onOpenChange={setIsDecisionHistoryDialogOpen}
        isBusy={isDecisionBusy}
        isLoading={isDecisionHistoryLoading}
        items={decisionHistory}
      />

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
           const targetPortfolio = dashboard.portfolios.find((portfolio) => portfolio.id === values.portfolioId);
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

      <PortfolioAddFundDialog
        open={isPortfolioAddFundDialogOpen}
        onOpenChange={setIsPortfolioAddFundDialogOpen}
        targetPortfolio={dashboard.selectedPortfolioSummary ?? null}
        onSubmit={async (values) => {
           if (!dashboard.selectedPortfolioMeta) return;
           await actions.addFundAction({
              portfolioId: dashboard.selectedPortfolioMeta.id,
              portfolioType: dashboard.selectedPortfolioMeta.type,
              fundCode: values.fundCode,
              holdingAmount: values.holdingAmount,
              holdingProfitAmount: values.holdingProfitAmount,
              plannedRatio: values.plannedRatio ?? ""
            });
            setIsPortfolioAddFundDialogOpen(false);
        }}
        isBusy={dashboard.isBusy}
      />
    </DashboardLayout>
  );
}

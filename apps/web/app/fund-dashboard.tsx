"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AuthUser,
  DailyDecision,
  DecisionDocFormat,
  PortfolioFundItem,
  PortfolioSummary,
  PortfolioType,
} from "@digmo/shared";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

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

// Shadcn UI
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const authRequiredEventName = getAuthRequiredEventName();

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

  const [deletePortfolioTarget, setDeletePortfolioTarget] = useState<PortfolioSummary | null>(null);
  const [deleteFundTarget, setDeleteFundTarget] = useState<PortfolioFundItem | null>(null);

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
    setErrorText: dashboard.setErrorText,
    setStatusText: dashboard.setStatusText,
  });

  const reorder = useFundReorder({
    selectedPortfolioId: dashboard.selectedPortfolioId,
    portfolioFunds: dashboard.portfolioFunds,
    setPortfolioFunds: dashboard.setPortfolioFunds,
    setIsReordering: dashboard.setIsReordering,
    setErrorText: dashboard.setErrorText,
    setStatusText: dashboard.setStatusText,
  });
  
  const portfolioReorder = usePortfolioReorder({
    portfolios: dashboard.portfolios,
    setPortfolios: dashboard.setPortfolios,
    setIsReordering: dashboard.setIsReordering,
    setErrorText: dashboard.setErrorText,
    setStatusText: dashboard.setStatusText,
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
        dashboard.setErrorText(
          error instanceof Error ? error.message : "加载决策数据失败"
        );
      } finally {
        setIsDecisionLoading(false);
      }
    },
    [dashboard.setErrorText]
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
      dashboard.setErrorText("上传文件内容为空");
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
      dashboard.setErrorText("请先选择具体组合");
      return;
    }

    if (!decisionDocContent.trim()) {
      dashboard.setErrorText("请先上传或填写策略文档");
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
      dashboard.setStatusText("策略文档已保存");
    } catch (error) {
      dashboard.setErrorText(
        error instanceof Error ? error.message : "保存策略文档失败"
      );
    } finally {
      setIsDecisionDocSubmitting(false);
    }
  }

  async function onGenerateDecision() {
    if (dashboard.selectedPortfolioId === "all") {
      dashboard.setErrorText("请先选择具体组合");
      return;
    }

    if (!decisionDocContent.trim()) {
      dashboard.setErrorText("请先保存策略文档");
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
      dashboard.setStatusText("今日建议已生成");
    } catch (error) {
      dashboard.setErrorText(
        error instanceof Error ? error.message : "生成今日建议失败"
      );
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
      dashboard.setErrorText(
        error instanceof Error ? error.message : "加载建议历史失败"
      );
    } finally {
      setIsDecisionHistoryLoading(false);
    }
  }

  async function onOpenDecisionHistoryDialog() {
    if (dashboard.selectedPortfolioId === "all") {
      dashboard.setErrorText("请先选择具体组合");
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
      dashboard.setErrorText("当前无可绑定的今日建议");
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
      dashboard.setErrorText(parsed.error.issues[0]?.message ?? "名称不合法");
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

  if (isAuthChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在校验登录状态...
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return null;
  }

  // --- Main Render Logic ---

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
            onDeletePortfolioTab={(portfolio) => setDeletePortfolioTarget(portfolio)}
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
           {/* If "all" is selected, show Overview Table (List of Portfolios) */}
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
                  onDeletePortfolioTab={(portfolio) => setDeletePortfolioTarget(portfolio)}
                  onPortfolioDragEnd={(event) => portfolioReorder.onPortfolioTabsDragEnd(event, dashboard.isReordering)}
                />
                <PortfolioOverviewTable
                  portfolios={dashboard.portfolios}
                  isLoading={dashboard.isLoadingPortfolios}
                  isBusy={dashboard.isBusy}
                  editingPortfolioId={editingPortfolioId}
                  editingPortfolioName={editingPortfolioName}
                  onDelete={(portfolio) => setDeletePortfolioTarget(portfolio)}
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
                <Button variant="ghost" onClick={() => dashboard.setSelectedPortfolioId("all")}>
                  ← 返回组合列表
                </Button>
                
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

                  <Card className={`flex min-h-0 flex-col ${analysisPanelHeightClass}`}>
                    <CardHeader className="py-3 pb-2">
                      <CardTitle className="text-base font-medium">决策与操作</CardTitle>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pb-3">
                      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                        <p className="whitespace-pre-line text-xs text-muted-foreground">
                          {latestDecision
                            ? latestDecision.summary
                            : "暂无今日建议，可在此更新建议并管理策略文档"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => void onGenerateDecision()}
                          disabled={isDecisionBusy}
                        >
                          更新建议
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setIsDecisionDrawerOpen(true)}
                          disabled={isDecisionBusy}
                        >
                          管理文档
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => void onOpenDecisionHistoryDialog()}
                          disabled={isDecisionBusy}
                        >
                          操作历史
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
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
                  onDeleteFund={(item) => setDeleteFundTarget(item)}
                  onDragEnd={(event) => reorder.onPortfolioFundsDragEnd(event, dashboard.isReordering)}
                  onRefresh={handleManualRefresh}
                  onOpenAddFundDialog={() => setIsPortfolioAddFundDialogOpen(true)}
                />
             </div>
           )}
        </>
      )}

      {dashboard.mainView === "analysis" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">分析报表</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            V2 视图已下线，当前暂无可展示的分析内容。
          </CardContent>
        </Card>
      )}

      <Dialog open={isDecisionDrawerOpen} onOpenChange={setIsDecisionDrawerOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden grid-rows-[auto_minmax(0,1fr)] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>决策与操作</DialogTitle>
            <DialogDescription>策略文档管理。</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
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
          </div>
        </DialogContent>
      </Dialog>

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
           if (!targetPortfolio) return; // Should handle error
           
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

      <AlertDialog open={Boolean(deletePortfolioTarget)} onOpenChange={(open) => (!open ? setDeletePortfolioTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除组合？</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePortfolioTarget ? `删除后将无法恢复：${deletePortfolioTarget.name}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deletePortfolioTarget) return;
                void actions.deletePortfolioAction(deletePortfolioTarget);
                setDeletePortfolioTarget(null);
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteFundTarget)} onOpenChange={(open) => (!open ? setDeleteFundTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认移除基金？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFundTarget ? `将从组合中移除基金 ${deleteFundTarget.fundCode}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteFundTarget) return;
                void actions.deleteFundAction(deleteFundTarget);
                setDeleteFundTarget(null);
              }}
            >
              确认移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

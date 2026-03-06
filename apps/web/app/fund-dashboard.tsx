"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PortfolioFundItem, PortfolioSummary, PortfolioType } from "@digmo/shared";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DailyProfitComparePanel } from "@/components/dashboard/daily-profit-compare-panel";
import { EstimateAnalysisPanel } from "@/components/dashboard/estimate-analysis-panel";
import { FlatFundsTable } from "@/components/dashboard/flat-funds-table";
import { MainViewTabs } from "@/components/dashboard/main-view-tabs";
import { PortfolioFundsTable } from "@/components/dashboard/portfolio-funds-table";
import { PortfolioOverviewTable } from "@/components/dashboard/portfolio-overview-table";
import { PortfolioToolbar } from "@/components/dashboard/portfolio-toolbar";
import { RatioAnalysisPanel } from "@/components/dashboard/ratio-analysis-panel";
import { StatusFeedback } from "@/components/dashboard/status-feedback";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getFlatSortButtonLabel, nextSortOrder, useDashboardData } from "@/hooks/use-dashboard-data";
import { useFundReorder } from "@/hooks/use-fund-reorder";
import { usePortfolioReorder } from "@/hooks/use-portfolio-reorder";
import { usePortfolioActions } from "@/hooks/use-portfolio-actions";
import { FundEditState } from "@/lib/format";

const renameSchema = z.string().min(1, "请输入新的组合名称").max(32, "组合名称长度不能超过 32");

const createPortfolioDialogSchema = z.object({
  name: z.string().min(1, "请输入组合名称").max(32, "组合名称长度不能超过 32"),
  type: z.enum(["FREE", "RATIO"])
});

const flatAddFundDialogSchema = z.object({
  portfolioId: z.string().min(1, "请选择目标组合"),
  fundCode: z.string().regex(/^\d{6}$/, "请输入 6 位基金代码"),
  holdingAmount: z.string().min(1, "请输入持仓金额"),
  holdingProfitAmount: z.string().optional(),
  plannedRatio: z.string().optional()
});

const portfolioAddFundDialogSchema = z.object({
  fundCode: z.string().regex(/^\d{6}$/, "请输入 6 位基金代码"),
  holdingAmount: z.string().min(1, "请输入持仓金额"),
  holdingProfitAmount: z.string().optional(),
  plannedRatio: z.string().optional()
});

export default function FundDashboard() {
  const dashboard = useDashboardData();
  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
  const [editingPortfolioName, setEditingPortfolioName] = useState("");

  const [deletePortfolioTarget, setDeletePortfolioTarget] = useState<PortfolioSummary | null>(null);
  const [deleteFundTarget, setDeleteFundTarget] = useState<PortfolioFundItem | null>(null);

  const [isCreatePortfolioDialogOpen, setIsCreatePortfolioDialogOpen] = useState(false);
  const [isFlatAddFundDialogOpen, setIsFlatAddFundDialogOpen] = useState(false);
  const [isPortfolioAddFundDialogOpen, setIsPortfolioAddFundDialogOpen] = useState(false);
  const [isRatioPanelExpanded, setIsRatioPanelExpanded] = useState(false);
  const [isEstimatePanelExpanded, setIsEstimatePanelExpanded] = useState(false);

  const createPortfolioForm = useForm<z.infer<typeof createPortfolioDialogSchema>>({
    resolver: zodResolver(createPortfolioDialogSchema),
    defaultValues: {
      name: "",
      type: "FREE"
    }
  });

  const flatAddFundForm = useForm<z.infer<typeof flatAddFundDialogSchema>>({
    resolver: zodResolver(flatAddFundDialogSchema),
    defaultValues: {
      portfolioId: "",
      fundCode: "",
      holdingAmount: "",
      holdingProfitAmount: "",
      plannedRatio: ""
    }
  });

  const portfolioAddFundForm = useForm<z.infer<typeof portfolioAddFundDialogSchema>>({
    resolver: zodResolver(portfolioAddFundDialogSchema),
    defaultValues: {
      fundCode: "",
      holdingAmount: "",
      holdingProfitAmount: "",
      plannedRatio: ""
    }
  });

  const actions = usePortfolioActions({
    refreshData: dashboard.refreshData,
    selectedPortfolioId: dashboard.selectedPortfolioId,
    setSelectedPortfolioId: dashboard.setSelectedPortfolioId,
    setIsLoading: dashboard.setIsLoading,
    setErrorText: dashboard.setErrorText,
    setStatusText: dashboard.setStatusText
  });

  const reorder = useFundReorder({
    selectedPortfolioId: dashboard.selectedPortfolioId,
    portfolioFunds: dashboard.portfolioFunds,
    setPortfolioFunds: dashboard.setPortfolioFunds,
    setIsReordering: dashboard.setIsReordering,
    setErrorText: dashboard.setErrorText,
    setStatusText: dashboard.setStatusText
  });
  const portfolioReorder = usePortfolioReorder({
    portfolios: dashboard.portfolios,
    setPortfolios: dashboard.setPortfolios,
    setIsReordering: dashboard.setIsReordering,
    setErrorText: dashboard.setErrorText,
    setStatusText: dashboard.setStatusText
  });

  const selectedPortfolioName = useMemo(
    () => dashboard.selectedPortfolioMeta?.name ?? dashboard.selectedPortfolioSummary?.name ?? "当前组合",
    [dashboard.selectedPortfolioMeta?.name, dashboard.selectedPortfolioSummary?.name]
  );

  const selectedPortfolioType = useMemo(
    () => (dashboard.selectedPortfolioMeta?.type ?? dashboard.selectedPortfolioSummary?.type ?? "FREE") as PortfolioType,
    [dashboard.selectedPortfolioMeta?.type, dashboard.selectedPortfolioSummary?.type]
  );

  const isRatioPortfolio = selectedPortfolioType === "RATIO";

  const dailyProfitCompareRows = useMemo(() => {
    const v2ById = new Map(dashboard.portfolioDailyProfitV2.map((item) => [item.id, item] as const));

    return dashboard.portfolios.map((v1) => {
      const v2 = v2ById.get(v1.id);
      const v1DailyProfitAmount = Number((v1.totalAmount * v1.dailyProfitPct).toFixed(2));
      const v2DailyProfitPct = v2?.dailyProfitPct ?? 0;
      const v2DailyProfitAmount =
        typeof v2?.dailyProfitAmount === "number" ? v2.dailyProfitAmount : Number((v1.totalAmount * v2DailyProfitPct).toFixed(2));
      const diffPct = Number((v2DailyProfitPct - v1.dailyProfitPct).toFixed(6));
      const diffAmount = Number((v2DailyProfitAmount - v1DailyProfitAmount).toFixed(2));

      return {
        portfolioId: v1.id,
        portfolioName: v1.name,
        portfolioType: v1.type,
        v1DailyProfitPct: v1.dailyProfitPct,
        v2DailyProfitPct,
        v1DailyProfitAmount,
        v2DailyProfitAmount,
        diffPct,
        diffAmount,
        missingFundCount: v2?.missingFundCount ?? 0
      };
    });
  }, [dashboard.portfolioDailyProfitV2, dashboard.portfolios]);

  const mergedRatioEstimateRows = useMemo(() => {
    const ratioByFund = new Map(dashboard.ratioAnalysisRows.map((row) => [row.fundCode, row] as const));
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
          intradayAmount: estimate.intradayAmount
        }
      ];
    });

    const rest = dashboard.ratioAnalysisRows
      .filter((row) => !usedFundCodes.has(row.fundCode))
      .map((row) => ({
        ...row,
        estimateChangePct: 0,
        intradayAmount: 0
      }));

    return merged.concat(rest);
  }, [dashboard.estimateAnalysisRows, dashboard.ratioAnalysisRows]);

  const flatTargetPortfolioId = flatAddFundForm.watch("portfolioId");
  const flatTargetPortfolio = useMemo(
    () => dashboard.portfolios.find((portfolio) => portfolio.id === flatTargetPortfolioId),
    [dashboard.portfolios, flatTargetPortfolioId]
  );
  const portfolioTotalAmount = useMemo(
    () => dashboard.portfolios.reduce((sum, portfolio) => sum + portfolio.totalAmount, 0),
    [dashboard.portfolios]
  );
  const portfolioTotalDailyAmount = useMemo(
    () => dashboard.portfolios.reduce((sum, portfolio) => sum + portfolio.totalAmount * portfolio.dailyProfitPct, 0),
    [dashboard.portfolios]
  );
  const isFlatAddFundSubmitting = flatAddFundForm.formState.isSubmitting;
  const isPortfolioAddFundSubmitting = portfolioAddFundForm.formState.isSubmitting;

  function onEditFieldChange(fundCode: string, key: keyof FundEditState, value: string) {
    dashboard.setEditStateMap((prev) => {
      const next = new Map(prev);
      const current = next.get(fundCode) ?? {
        holdingAmount: "",
        plannedRatio: "",
        holdingProfitAmount: ""
      };
      next.set(fundCode, {
        ...current,
        [key]: value
      });
      return next;
    });
  }

  async function onUpdateFund(item: PortfolioFundItem) {
    const edit = dashboard.editStateMap.get(item.fundCode);
    if (!edit) {
      return;
    }
    await actions.updateFundAction(item, edit.holdingAmount, edit.plannedRatio, edit.holdingProfitAmount);
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

  async function submitCreatePortfolio(values: z.infer<typeof createPortfolioDialogSchema>) {
    await actions.createPortfolioAction(values.name, values.type as PortfolioType);
    setIsCreatePortfolioDialogOpen(false);
    createPortfolioForm.reset({ name: "", type: "FREE" });
  }

  async function submitFlatAddFund(values: z.infer<typeof flatAddFundDialogSchema>) {
    const targetPortfolio = dashboard.portfolios.find((portfolio) => portfolio.id === values.portfolioId);
    if (!targetPortfolio) {
      flatAddFundForm.setError("portfolioId", { message: "请选择目标组合" });
      return;
    }

    if (targetPortfolio.type === "RATIO" && !(values.plannedRatio ?? "").trim()) {
      flatAddFundForm.setError("plannedRatio", { message: "按比例组合请填写计划比例" });
      return;
    }

    await actions.addFundAction({
      portfolioId: targetPortfolio.id,
      portfolioType: targetPortfolio.type,
      fundCode: values.fundCode,
      holdingAmount: values.holdingAmount,
      holdingProfitAmount: values.holdingProfitAmount,
      plannedRatio: values.plannedRatio ?? ""
    });

    setIsFlatAddFundDialogOpen(false);
    flatAddFundForm.reset({
      portfolioId: "",
      fundCode: "",
      holdingAmount: "",
      holdingProfitAmount: "",
      plannedRatio: ""
    });
  }

  async function submitPortfolioAddFund(values: z.infer<typeof portfolioAddFundDialogSchema>) {
    if (!dashboard.selectedPortfolioMeta) {
      dashboard.setErrorText("请先选择具体组合");
      return;
    }

    if (dashboard.selectedPortfolioMeta.type === "RATIO" && !(values.plannedRatio ?? "").trim()) {
      portfolioAddFundForm.setError("plannedRatio", { message: "按比例组合请填写计划比例" });
      return;
    }

    await actions.addFundAction({
      portfolioId: dashboard.selectedPortfolioMeta.id,
      portfolioType: dashboard.selectedPortfolioMeta.type,
      fundCode: values.fundCode,
      holdingAmount: values.holdingAmount,
      holdingProfitAmount: values.holdingProfitAmount,
      plannedRatio: values.plannedRatio ?? ""
    });

    setIsPortfolioAddFundDialogOpen(false);
    portfolioAddFundForm.reset({
      fundCode: "",
      holdingAmount: "",
      holdingProfitAmount: "",
      plannedRatio: ""
    });
  }

  return (
    <DashboardShell totalAmount={portfolioTotalAmount} totalIntradayAmount={portfolioTotalDailyAmount}>
      <section className="mb-4 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <MainViewTabs value={dashboard.mainView} onChange={dashboard.setMainView} />
          {dashboard.mainView === "portfolios" ? (
            <Button type="button" onClick={() => setIsCreatePortfolioDialogOpen(true)} disabled={dashboard.isBusy}>
              创建组合
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => setIsFlatAddFundDialogOpen(true)}
              disabled={dashboard.isBusy || dashboard.portfolios.length === 0}
              aria-label="添加基金"
            >
              添加基金
            </Button>
          )}
        </div>

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

        <StatusFeedback lastManualRefreshAt={dashboard.lastManualRefreshAt} />
      </section>

      {dashboard.mainView === "portfolios" && dashboard.selectedPortfolioId === "all" ? (
        <section className="mb-4">
          <DailyProfitComparePanel
            rows={dailyProfitCompareRows}
            isLoading={dashboard.isLoadingPortfolioDailyProfitV2}
            generatedAt={dashboard.portfolioDailyProfitV2Meta?.generatedAt}
            tradeDate={dashboard.portfolioDailyProfitV2Meta?.tradeDate}
            source={dashboard.portfolioDailyProfitV2Meta?.source}
          />
        </section>
      ) : null}

      {dashboard.mainView === "funds" ? (
        <FlatFundsTable
          data={dashboard.flatFunds}
          expand={dashboard.flatExpand}
          isLoading={dashboard.isLoadingFlatFunds}
          isBusy={dashboard.isBusy}
          onRefresh={handleManualRefresh}
        />
      ) : null}

      {dashboard.mainView === "portfolios" && dashboard.selectedPortfolioId === "all" ? (
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
      ) : null}

      {dashboard.mainView === "portfolios" && dashboard.selectedPortfolioId !== "all" ? (
        <section className="space-y-4">
          {isRatioPortfolio ? (
            <RatioAnalysisPanel
              rows={mergedRatioEstimateRows}
              sortOrder={dashboard.estimateSortOrder}
              onToggleSort={() => dashboard.setEstimateSortOrder((prev) => nextSortOrder(prev))}
              expanded={isRatioPanelExpanded}
              onToggleExpanded={() => setIsRatioPanelExpanded((prev) => !prev)}
              disabled={dashboard.isBusy}
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
            />
          )}

          <PortfolioFundsTable
            portfolioName={selectedPortfolioName}
            portfolioType={selectedPortfolioType}
            funds={dashboard.portfolioFunds}
            editStateMap={dashboard.editStateMap}
            isBusy={dashboard.isBusy}
            isLoading={dashboard.isLoadingPortfolioFunds}
            onEditFieldChange={onEditFieldChange}
            onUpdateFund={onUpdateFund}
            onDeleteFund={(item) => setDeleteFundTarget(item)}
            onDragEnd={(event) => reorder.onPortfolioFundsDragEnd(event, dashboard.isReordering)}
            onRefresh={handleManualRefresh}
            onOpenAddFundDialog={() => setIsPortfolioAddFundDialogOpen(true)}
          />
        </section>
      ) : null}

      <Dialog
        open={isCreatePortfolioDialogOpen}
        onOpenChange={(open) => {
          setIsCreatePortfolioDialogOpen(open);
          if (!open) {
            createPortfolioForm.reset({ name: "", type: "FREE" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建组合</DialogTitle>
            <DialogDescription>填写组合名称并选择类型。</DialogDescription>
          </DialogHeader>
          <Form {...createPortfolioForm}>
            <form className="space-y-4" onSubmit={createPortfolioForm.handleSubmit(submitCreatePortfolio)}>
              <FormField
                control={createPortfolioForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>组合名称</FormLabel>
                    <FormControl>
                      <Input placeholder="例如：稳健组合" disabled={dashboard.isBusy} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createPortfolioForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>组合类型</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange} disabled={dashboard.isBusy}>
                        <SelectTrigger>
                          <SelectValue placeholder="请选择组合类型" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FREE">自由组合</SelectItem>
                          <SelectItem value="RATIO">按比例组合</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setIsCreatePortfolioDialogOpen(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={dashboard.isBusy}>
                  确认创建
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isFlatAddFundDialogOpen}
        onOpenChange={(open) => {
          setIsFlatAddFundDialogOpen(open);
          if (!open) {
            flatAddFundForm.reset({
              portfolioId: "",
              fundCode: "",
              holdingAmount: "",
              holdingProfitAmount: "",
              plannedRatio: ""
            });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加基金</DialogTitle>
            <DialogDescription>先选择目标组合，再填写基金信息。</DialogDescription>
          </DialogHeader>
          <Form {...flatAddFundForm}>
            <form className="space-y-4" onSubmit={flatAddFundForm.handleSubmit(submitFlatAddFund)}>
              <FormField
                control={flatAddFundForm.control}
                name="portfolioId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>目标组合</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange} disabled={dashboard.isBusy}>
                        <SelectTrigger>
                          <SelectValue placeholder="请选择目标组合" />
                        </SelectTrigger>
                        <SelectContent>
                          {dashboard.portfolios.map((portfolio) => (
                            <SelectItem key={portfolio.id} value={portfolio.id}>
                              {portfolio.name}（{portfolio.type === "FREE" ? "自由" : "按比例"}）
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={flatAddFundForm.control}
                name="fundCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>基金代码</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" placeholder="000000" disabled={dashboard.isBusy} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={flatAddFundForm.control}
                name="holdingAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>持仓金额</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="例如：5000" disabled={dashboard.isBusy} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={flatAddFundForm.control}
                name="holdingProfitAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>持有收益金额（可正可负）</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="例如：-88.36（不填默认为 0）" disabled={dashboard.isBusy} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {flatTargetPortfolio?.type === "RATIO" ? (
                <FormField
                  control={flatAddFundForm.control}
                  name="plannedRatio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>计划比例(%)</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" placeholder="例如：25" disabled={dashboard.isBusy} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setIsFlatAddFundDialogOpen(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={dashboard.isBusy || isFlatAddFundSubmitting} aria-busy={isFlatAddFundSubmitting}>
                  {isFlatAddFundSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      添加中...
                    </>
                  ) : (
                    "确认添加"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPortfolioAddFundDialogOpen}
        onOpenChange={(open) => {
          setIsPortfolioAddFundDialogOpen(open);
          if (!open) {
            portfolioAddFundForm.reset({
              fundCode: "",
              holdingAmount: "",
              holdingProfitAmount: "",
              plannedRatio: ""
            });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加基金到当前组合</DialogTitle>
            <DialogDescription>{dashboard.selectedPortfolioMeta ? `目标组合：${dashboard.selectedPortfolioMeta.name}` : ""}</DialogDescription>
          </DialogHeader>
          <Form {...portfolioAddFundForm}>
            <form className="space-y-4" onSubmit={portfolioAddFundForm.handleSubmit(submitPortfolioAddFund)}>
              <FormField
                control={portfolioAddFundForm.control}
                name="fundCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>基金代码</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" placeholder="000000" disabled={dashboard.isBusy} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={portfolioAddFundForm.control}
                name="holdingAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>持仓金额</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="例如：5000" disabled={dashboard.isBusy} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={portfolioAddFundForm.control}
                name="holdingProfitAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>持有收益金额（可正可负）</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="例如：-88.36（不填默认为 0）" disabled={dashboard.isBusy} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {dashboard.selectedPortfolioMeta?.type === "RATIO" ? (
                <FormField
                  control={portfolioAddFundForm.control}
                  name="plannedRatio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>计划比例(%)</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" placeholder="例如：25" disabled={dashboard.isBusy} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setIsPortfolioAddFundDialogOpen(false)}>
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={dashboard.isBusy || isPortfolioAddFundSubmitting}
                  aria-busy={isPortfolioAddFundSubmitting}
                >
                  {isPortfolioAddFundSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      添加中...
                    </>
                  ) : (
                    "确认添加"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

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
                if (!deletePortfolioTarget) {
                  return;
                }
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
                if (!deleteFundTarget) {
                  return;
                }
                void actions.deleteFundAction(deleteFundTarget);
                setDeleteFundTarget(null);
              }}
            >
              确认移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
}

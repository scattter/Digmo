"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  DailyDecision,
  DecisionDocFormat,
  PortfolioSummary,
  PortfolioFundItem,
  PositionOperationType
} from "@digmo/shared";
import {
  fetchDailyDecisionHistory,
  fetchDecisionDoc,
  fetchLatestDailyDecision,
  generateDailyDecision,
  upsertDecisionDoc
} from "@/lib/api";
import { PlanCompletionCard } from "../cards/plan-completion-card";
import { PortfolioFundsTable } from "../features/portfolios/portfolio-funds-table";
import { DailyDecisionPanel } from "../features/decision/daily-decision-panel";
import { DecisionHistoryDialog } from "../dialogs/decision-history-dialog";
import { Card, Typography, Button, Modal, App, Spin } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { FundEditState } from "@/lib/format";
import { DragEndEvent } from "@dnd-kit/core";
import { useIsMobile } from "@/hooks/use-is-mobile";

const { Title, Text } = Typography;

interface RatioAnalysisRow {
  fundCode: string;
  fundName: string;
  plannedRatio: number;
  actualRatio: number;
  estimateChangePct: number;
  intradayAmount: number;
}

interface PortfolioDetailViewProps {
  portfolio: PortfolioSummary;
  funds: PortfolioFundItem[];
  editStateMap: Map<string, FundEditState>;
  onEditFieldChange: (fundCode: string, key: keyof FundEditState, value: string) => void;
  onUpdateFund: (item: PortfolioFundItem) => Promise<void>;
  onOperateFund: (item: PortfolioFundItem, input: { operationType: PositionOperationType; amountRaw: string; bindActionOrder?: number; decisionId?: string }) => Promise<void>;
  onDeleteFund: (item: PortfolioFundItem) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onOpenAddFundDialog: () => void;
  onRefresh: () => Promise<void>;
  isBusy: boolean;
  isLoading: boolean;
}

export function PortfolioDetailView({
  portfolio,
  funds,
  editStateMap,
  onEditFieldChange,
  onUpdateFund,
  onOperateFund,
  onDeleteFund,
  onDragEnd,
  onOpenAddFundDialog,
  onRefresh,
  isBusy,
  isLoading,
}: PortfolioDetailViewProps) {
  const { message } = App.useApp();
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
  const isMobile = useIsMobile();
  const isDecisionBusy = isBusy || isDecisionDocSubmitting || isGeneratingSuggestion;
  const hasActiveDecisionDoc = typeof decisionDocVersion === "number";

  const todayInShanghai = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  }, []);

  const latestDecisionForBinding = useMemo(() => {
    if (!latestDecision) {
      return null;
    }
    return latestDecision.tradeDate === todayInShanghai ? latestDecision : null;
  }, [latestDecision, todayInShanghai]);

  const loadDecisionArtifacts = useCallback(async () => {
    setIsDecisionLoading(true);
    try {
      const [doc, latest] = await Promise.all([
        fetchDecisionDoc(portfolio.id),
        fetchLatestDailyDecision(portfolio.id)
      ]);
      setDecisionDocSourceFileName(doc?.sourceFileName);
      setDecisionDocContent(doc?.content ?? "");
      setDecisionDocFormat(doc?.format ?? "TEXT");
      setDecisionDocVersion(doc?.version);
      setLatestDecision(latest);
    } catch (error) {
      const text = error instanceof Error ? error.message : "加载决策数据失败";
      message.error(text);
    } finally {
      setIsDecisionLoading(false);
    }
  }, [message, portfolio.id]);

  useEffect(() => {
    void loadDecisionArtifacts();
    setDecisionHistory([]);
  }, [loadDecisionArtifacts]);

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
    if (!decisionDocContent.trim()) {
      message.error("请先上传或填写策略文档");
      return;
    }

    setIsDecisionDocSubmitting(true);
    try {
      const doc = await upsertDecisionDoc({
        portfolioId: portfolio.id,
        content: decisionDocContent.trim(),
        format: decisionDocFormat,
        sourceFileName: decisionDocSourceFileName
      });
      setDecisionDocSourceFileName(doc.sourceFileName);
      setDecisionDocContent(doc.content);
      setDecisionDocFormat(doc.format);
      setDecisionDocVersion(doc.version);
      message.success("策略文档已保存");
    } catch (error) {
      const text = error instanceof Error ? error.message : "保存策略文档失败";
      message.error(text);
    } finally {
      setIsDecisionDocSubmitting(false);
    }
  }

  async function onGenerateDecision() {
    if (!decisionDocContent.trim()) {
      message.error("请先保存策略文档");
      return;
    }

    setIsGeneratingSuggestion(true);
    try {
      const decision = await generateDailyDecision(portfolio.id);
      setLatestDecision(decision);
      setDecisionHistory((prev) => [decision, ...prev.filter((item) => item.id !== decision.id)]);
      message.success("今日建议已生成");
    } catch (error) {
      const text = error instanceof Error ? error.message : "生成今日建议失败";
      message.error(text);
    } finally {
      setIsGeneratingSuggestion(false);
    }
  }

  async function loadDecisionHistory() {
    setIsDecisionHistoryLoading(true);
    try {
      const history = await fetchDailyDecisionHistory(portfolio.id, 100);
      setDecisionHistory(history);
    } catch (error) {
      const text = error instanceof Error ? error.message : "加载建议历史失败";
      message.error(text);
    } finally {
      setIsDecisionHistoryLoading(false);
    }
  }

  async function onOpenDecisionHistoryDialog() {
    setIsDecisionHistoryDialogOpen(true);
    await loadDecisionHistory();
  }

  const ratioAnalysis: RatioAnalysisRow[] = useMemo(() => {
     if (portfolio.type !== 'RATIO') return [];
     
     return funds.map(fund => {
        if (typeof fund.plannedRatio !== 'number' || typeof fund.actualRatio !== 'number') return null;
        
        const estimateChangePct = typeof fund.estimateChangePct === 'number' ? fund.estimateChangePct : 0;
        const intradayAmount = typeof fund.intradayAmount === 'number' 
           ? fund.intradayAmount 
           : Number((fund.holdingAmount * estimateChangePct).toFixed(2));
           
        return {
           fundCode: fund.fundCode,
           fundName: fund.fundName ?? `基金 ${fund.fundCode}`,
           plannedRatio: fund.plannedRatio,
           actualRatio: fund.actualRatio,
           estimateChangePct,
           intradayAmount
        };
     }).filter((item): item is RatioAnalysisRow => item !== null);
  }, [funds, portfolio.type]);

  return (
    <div className="space-y-6 p-4">
      {/* 1. Portfolio Header Info */}
      {/*<div className="flex items-center justify-between">*/}
      {/*   <div>*/}
      {/*      <Title level={5} style={{ margin: 0 }}>{portfolio.name}</Title>*/}
      {/*      <Text type="secondary">{portfolio.type === 'RATIO' ? '按比例组合' : '自由组合'}</Text>*/}
      {/*   </div>*/}
      {/*   <Button icon={<ReloadOutlined />} onClick={() => void onRefresh()} loading={isBusy}>刷新数据</Button>*/}
      {/*</div>*/}

      {/* 2. Decision Summary */}
      <Card title="决策与操作" size="small" styles={{
        body: {paddingTop: 12, paddingBottom: 12}
      }}>
         <div style={{ maxHeight: 200, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
               <Spin spinning={isDecisionLoading || isGeneratingSuggestion} description="正在更新建议...">
                  <Text type="secondary" style={{ whiteSpace: "pre-line", display: "block" }}>
                     {latestDecision ? latestDecision.summary : "暂无今日建议，可在此更新建议并管理策略文档"}
                  </Text>
               </Spin>
            </div>
            {!hasActiveDecisionDoc ? (
               <Text type="secondary" style={{ fontSize: 12 }}>
                  当前组合还没有策略文档，请先点击“管理文档”保存后再更新建议。
               </Text>
            ) : null}
            <div className="flex flex-wrap gap-2">
               <Button
                  size="small"
                  onClick={() => void onGenerateDecision()}
                  disabled={isDecisionBusy || !hasActiveDecisionDoc}
               >
                  更新建议
               </Button>
               <Button
                  size="small"
                  onClick={() => setIsDecisionDrawerOpen(true)}
                  disabled={isDecisionBusy}
               >
                  管理文档
               </Button>
               <Button size="small" onClick={() => void onOpenDecisionHistoryDialog()} disabled={isDecisionBusy}>
                  历史
               </Button>
            </div>
         </div>
      </Card>

      {/* 3. Plan Completion Cards (Only for Ratio portfolios) */}
      {portfolio.type === 'RATIO' && !isMobile && (
         <Card title="计划达成情况" size="small">
            {ratioAnalysis.length === 0 ? (
               <Text type="secondary">暂无计划数据</Text>
            ) : (
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {ratioAnalysis.map(row => (
                     <PlanCompletionCard
                        key={row.fundCode}
                        {...row}
                     />
                  ))}
               </div>
            )}
         </Card>
      )}

      {/* 4. Fund List */}
      <PortfolioFundsTable
         portfolioName={portfolio.name}
         portfolioType={portfolio.type}
         funds={funds}
         editStateMap={editStateMap}
         isBusy={isBusy}
         isLoading={isLoading}
         onEditFieldChange={onEditFieldChange}
         onUpdateFund={onUpdateFund}
         onOperateFund={async (item, input) => {
            if (typeof input.bindActionOrder === "number" && !latestDecisionForBinding) {
               const text = "当前无可绑定的今日建议";
               message.error(text);
               throw new Error(text);
            }
            await onOperateFund(item, {
               ...input,
               decisionId: latestDecisionForBinding?.id
            });
         }}
         latestDecisionForBinding={latestDecisionForBinding}
         onDeleteFund={onDeleteFund}
         onDragEnd={onDragEnd}
         onRefresh={onRefresh}
         onOpenAddFundDialog={onOpenAddFundDialog}
      />

      <Modal
         title="决策与操作"
         open={isDecisionDrawerOpen}
         onCancel={() => setIsDecisionDrawerOpen(false)}
         footer={null}
         width={900}
         centered
      >
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
    </div>
  );
}

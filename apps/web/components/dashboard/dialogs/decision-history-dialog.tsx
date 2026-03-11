"use client";

import { DailyDecision } from "@digmo/shared";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog-official";
import { formatBeijingTime, formatPct } from "@/lib/format";

interface DecisionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isBusy: boolean;
  isLoading: boolean;
  items: DailyDecision[];
}

function formatHistoryDate(input: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date(input));
}

export function DecisionHistoryDialog(props: DecisionHistoryDialogProps) {
  const { open, onOpenChange, isBusy, isLoading, items } = props;
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => items, [items]);

  function toggleExpanded(decisionId: string): void {
    setExpandedIds((prev) => ({
      ...prev,
      [decisionId]: !prev[decisionId],
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>建议历史</DialogTitle>
          <DialogDescription>默认仅显示日期，点击展开可查看完整建议内容。</DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            {isLoading ? "加载中..." : "暂无建议历史"}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((item) => {
              const expanded = expandedIds[item.id] === true;
              return (
                <div key={item.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{formatHistoryDate(item.createdAt)}</p>
                    <Button type="button" variant="secondary" size="sm" onClick={() => toggleExpanded(item.id)} disabled={isBusy}>
                      {expanded ? (
                        <>
                          <ChevronUp className="h-4 w-4" />
                          收起
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          展开
                        </>
                      )}
                    </Button>
                  </div>

                  {expanded ? (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      <div className="space-y-1">
                        <p className="whitespace-pre-line text-sm font-medium">{item.summary}</p>
                        <p className="text-xs text-muted-foreground">
                          生成于 {formatBeijingTime(item.createdAt)} · 耗时 {item.latencyMs}ms · token {item.usage.totalTokens ?? "-"}
                        </p>
                      </div>
                      {item.actions.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">本次生成无动作建议。</div>
                      ) : (
                        <div className="space-y-3">
                          {item.actions.map((action, index) => (
                            <div key={`${item.id}:${index}`} className="space-y-2 rounded-md border border-border p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="default">{action.actionType}</Badge>
                                <span className="font-mono text-sm">{action.fundCode}</span>
                                {action.fundName ? <span className="text-sm">{action.fundName}</span> : null}
                                <Badge variant="secondary">{action.riskLevel}</Badge>
                                <span className="text-xs text-muted-foreground">置信度 {formatPct(action.confidence)}</span>
                              </div>
                              <p className="whitespace-pre-line text-sm">{action.rationale}</p>
                              <p className="text-xs text-muted-foreground">
                                触发条件：{action.triggerCondition} · 失效时间：{formatBeijingTime(action.validUntil)}
                              </p>
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">来源依据</p>
                                {action.citations.map((citation, citationIndex) => (
                                  <div key={`${item.id}:${index}:${citationIndex}`} className="rounded border border-border/70 p-2 text-xs">
                                    <p className="font-medium">{citation.title}</p>
                                    <p className="whitespace-pre-line text-muted-foreground">{citation.snippet}</p>
                                    <div className="mt-1 flex items-center gap-2">
                                      <Badge variant="secondary">{citation.sourceType}</Badge>
                                      {citation.url ? (
                                        <a href={citation.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                                          来源链接
                                        </a>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import {
  DailyDecision,
  PortfolioFundItem,
  PositionOperationType,
} from "@digmo/shared";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog-official";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FundEditState } from "@/lib/format";

interface UpdateFundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PortfolioFundItem | null;
  editState: FundEditState;
  onEditFieldChange: (key: keyof FundEditState, value: string) => void;
  onUpdate: () => Promise<void>;
  onOperate: (
    operationType: PositionOperationType,
    amountRaw: string,
    bindActionOrder?: number
  ) => Promise<void>;
  latestDecisionForBinding: DailyDecision | null;
  isBusy?: boolean;
}

export function UpdateFundDialog({
  open,
  onOpenChange,
  target,
  editState,
  onEditFieldChange,
  onUpdate,
  onOperate,
  latestDecisionForBinding,
  isBusy,
}: UpdateFundDialogProps) {
  const [mode, setMode] = useState<"DIRECT" | "INCREASE" | "DECREASE">("DIRECT");
  const [operationAmount, setOperationAmount] = useState("");
  const [bindActionOrder, setBindActionOrder] = useState<string>("none");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when dialog opens/closes or target changes
  useEffect(() => {
    if (open) {
      setMode("DIRECT");
      setOperationAmount("");
      setBindActionOrder("none");
      setIsSubmitting(false);
    }
  }, [open, target]);

  const suggestionActions = useMemo(
    () => latestDecisionForBinding?.actions ?? [],
    [latestDecisionForBinding]
  );

  if (!target) return null;

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      if (mode === "DIRECT") {
        await onUpdate();
      } else {
        const parsedOrder =
          bindActionOrder === "none" ? undefined : Number(bindActionOrder);
        await onOperate(mode, operationAmount, parsedOrder);
      }
      onOpenChange(false);
    } catch (error) {
      // Error handling is done by parent usually, but we stop loading state
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>更新基金</DialogTitle>
          <DialogDescription>
            {target.fundName ?? `基金 ${target.fundCode}`} ({target.fundCode})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as any)}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="DIRECT" disabled={isBusy}>
                直接更新
              </TabsTrigger>
              <TabsTrigger value="INCREASE" disabled={isBusy}>
                加仓
              </TabsTrigger>
              <TabsTrigger value="DECREASE" disabled={isBusy}>
                减仓
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "DIRECT" ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="holdingAmount">持仓金额</Label>
                <Input
                  id="holdingAmount"
                  inputMode="decimal"
                  value={editState.holdingAmount}
                  onChange={(e) => onEditFieldChange("holdingAmount", e.target.value)}
                  disabled={isBusy}
                />
              </div>

              {target.portfolioType === "RATIO" && (
                <div className="grid gap-2">
                  <Label htmlFor="plannedRatio">计划持有比例(%)</Label>
                  <Input
                    id="plannedRatio"
                    inputMode="decimal"
                    value={editState.plannedRatio}
                    onChange={(e) => onEditFieldChange("plannedRatio", e.target.value)}
                    disabled={isBusy}
                  />
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="holdingProfitAmount">持有收益金额</Label>
                <Input
                  id="holdingProfitAmount"
                  inputMode="decimal"
                  value={editState.holdingProfitAmount}
                  onChange={(e) =>
                    onEditFieldChange("holdingProfitAmount", e.target.value)
                  }
                  disabled={isBusy}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="operationAmount">
                  {mode === "INCREASE" ? "加仓金额" : "减仓金额"}
                </Label>
                <Input
                  id="operationAmount"
                  inputMode="decimal"
                  value={operationAmount}
                  onChange={(e) => setOperationAmount(e.target.value)}
                  disabled={isBusy}
                  placeholder="请输入金额"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bindAction">绑定今日建议（可选）</Label>
                <Select
                  value={bindActionOrder}
                  onValueChange={setBindActionOrder}
                  disabled={isBusy || suggestionActions.length === 0}
                >
                  <SelectTrigger id="bindAction">
                    <SelectValue placeholder="选择绑定的建议" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不绑定</SelectItem>
                    {suggestionActions.map((action, index) => (
                      <SelectItem key={index} value={String(index)}>
                        {action.actionType === "BUY" ? "买入" : "卖出"} ·{" "}
                        {action.fundCode} · {action.rationale}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {suggestionActions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    当前无可绑定的今日建议
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isBusy || isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "DIRECT"
              ? "确认更新"
              : mode === "INCREASE"
              ? "确认加仓"
              : "确认减仓"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PortfolioFundItem, PortfolioType } from "@digmo/shared";
import { GripVertical, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FundEditState, formatCurrency, formatSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SortableFundRowProps {
  item: PortfolioFundItem;
  isBusy: boolean;
  onDeleteFund: (item: PortfolioFundItem) => void;
  onOpenUpdateDialog: (item: PortfolioFundItem) => void;
}

function formatSignedCurrencyValue(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}¥${formatCurrency(Math.abs(value))}`;
}

function holdingProfitText(item: PortfolioFundItem): string {
  return `${formatSignedCurrencyValue(item.holdingProfitAmount)} / ${formatSignedPct(item.holdingProfitPct)}`;
}

function dailyProfitText(item: PortfolioFundItem): string {
  const pct = typeof item.dailyProfitPct === "number" ? item.dailyProfitPct : item.estimateChangePct ?? 0;
  const amount =
    typeof item.dailyProfitAmount === "number"
      ? item.dailyProfitAmount
      : Number((item.holdingAmount * pct).toFixed(2));
  return `${formatSignedCurrencyValue(amount)} / ${formatSignedPct(pct)}`;
}

function ratioBar(item: PortfolioFundItem) {
  if (item.portfolioType !== "RATIO" || typeof item.actualRatio !== "number" || typeof item.plannedRatio !== "number") {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  const overrun = Math.max(0, item.actualRatio - item.plannedRatio);
  const actualWidth =
    item.plannedRatio > 0 ? Math.min((item.actualRatio / item.plannedRatio) * 100, 100) : item.actualRatio > 0 ? 100 : 0;

  return (
    <div className="w-[100px] space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{(item.actualRatio * 100).toFixed(1)}%</span>
        <span>{(item.plannedRatio * 100).toFixed(1)}%</span>
      </div>
      <div className="relative h-2.5 w-[100px] overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 w-full rounded-full bg-primary/30" />
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${overrun > 0 ? "bg-warning" : "bg-success"}`}
          style={{ width: `${actualWidth}%` }}
        />
      </div>
    </div>
  );
}

function SortableFundRow({ item, isBusy, onDeleteFund, onOpenUpdateDialog }: SortableFundRowProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.fundCode,
    disabled: isBusy
  });
  const fixedBgClass = "bg-white";

  return (
    <TableRow
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
      className={cn(isDragging ? "bg-muted" : undefined)}
    >
      <TableCell className={`sticky left-0 z-20 w-[72px] ${fixedBgClass}`}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`拖拽排序 ${item.fundName ?? item.fundCode}`}
          disabled={isBusy}
        >
          <GripVertical className="h-4 w-4" />
        </Button>
      </TableCell>

      <TableCell className={`sticky left-[72px] z-20 w-[150px] min-w-[150px] max-w-[150px] ${fixedBgClass}`}>
        <p
          className="max-w-[150px] overflow-hidden text-sm font-medium leading-5 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
          title={item.fundName ?? `基金 ${item.fundCode}`}
        >
          {item.fundName ?? `基金 ${item.fundCode}`}
        </p>
        <p className="text-xs font-mono text-muted-foreground">{item.fundCode}</p>
      </TableCell>

      <TableCell className="min-w-[130px] max-w-[130px] font-mono">¥{formatCurrency(item.holdingAmount)}</TableCell>
      <TableCell className="min-w-[130px] max-w-[130px] font-mono text-xs tracking-tight">{holdingProfitText(item).replace(/\s*\/\s*/g, "/")}</TableCell>
      <TableCell className="min-w-[130px] max-w-[130px] font-mono text-xs tracking-tight">
        <p>{dailyProfitText(item).replace(/\s*\/\s*/g, "/")}</p>
        {item.dailyProfitOfficialUpdated ? <p className="text-[10px] text-muted-foreground">已更新</p> : null}
      </TableCell>
      <TableCell className="min-w-[118px]">{ratioBar(item)}</TableCell>

      <TableCell className={`sticky right-0 z-20 min-w-[120px] max-w-[120px] ${fixedBgClass}`}>
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            size="sm"
            className="h-7 px-1.5 text-[11px]"
            variant="secondary"
            onClick={() => onOpenUpdateDialog(item)}
            disabled={isBusy}
          >
            更新
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 px-1.5 text-[11px]"
            variant="danger"
            onClick={() => onDeleteFund(item)}
            disabled={isBusy}
          >
            删除
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface PortfolioFundsTableProps {
  portfolioName: string;
  portfolioType: PortfolioType;
  funds: PortfolioFundItem[];
  editStateMap: Map<string, FundEditState>;
  isBusy: boolean;
  isLoading: boolean;
  onEditFieldChange: (fundCode: string, key: keyof FundEditState, value: string) => void;
  onUpdateFund: (item: PortfolioFundItem) => Promise<void>;
  onDeleteFund: (item: PortfolioFundItem) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onRefresh: () => Promise<void>;
  onOpenAddFundDialog: () => void;
}

export function PortfolioFundsTable({
  portfolioName,
  portfolioType,
  funds,
  editStateMap,
  isBusy,
  isLoading,
  onEditFieldChange,
  onUpdateFund,
  onDeleteFund,
  onDragEnd,
  onRefresh,
  onOpenAddFundDialog
}: PortfolioFundsTableProps) {
  const [updateTarget, setUpdateTarget] = useState<PortfolioFundItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 8
      }
    })
  );

  const sortableIds = useMemo(() => funds.map((item) => item.fundCode), [funds]);

  function getEditState(item: PortfolioFundItem): FundEditState {
    return (
      editStateMap.get(item.fundCode) ?? {
        holdingAmount: String(item.holdingAmount),
        plannedRatio: typeof item.plannedRatio === "number" ? String((item.plannedRatio * 100).toFixed(2)) : "",
        holdingProfitAmount: String(item.holdingProfitAmount)
      }
    );
  }

  function onOpenUpdateDialog(item: PortfolioFundItem) {
    onEditFieldChange(item.fundCode, "holdingAmount", String(item.holdingAmount));
    onEditFieldChange(
      item.fundCode,
      "plannedRatio",
      typeof item.plannedRatio === "number" ? String((item.plannedRatio * 100).toFixed(2)) : ""
    );
    onEditFieldChange(item.fundCode, "holdingProfitAmount", String(item.holdingProfitAmount));
    setUpdateTarget(item);
  }

  async function onSubmitUpdate() {
    if (!updateTarget) {
      return;
    }

    try {
      await onUpdateFund(updateTarget);
      setUpdateTarget(null);
    } catch {
      // keep dialog open when validation/update fails
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">
          {portfolioName} · {portfolioType === "FREE" ? "自由组合" : "按比例组合"}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button type="button" variant="default" size="sm" onClick={onOpenAddFundDialog} disabled={isBusy}>
            添加基金
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => void onRefresh()} disabled={isBusy}>
            <RefreshCw className="h-4 w-4" />
            手动更新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : null}

        {!isLoading && funds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            当前组合暂无基金，请通过“添加基金”按钮添加。
          </div>
        ) : null}

        {!isLoading && funds.length > 0 ? (
          <>
            <div className="hidden md:block">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                  <Table className="min-w-[860px]">
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="sticky left-0 z-30 w-[72px]">排序</TableHead>
                        <TableHead className="sticky left-[72px] z-30 w-[150px] min-w-[150px]">基金</TableHead>
                        <TableHead className="min-w-[130px]">持仓</TableHead>
                        <TableHead className="min-w-[130px]">持有收益</TableHead>
                        <TableHead className="min-w-[130px]">当日收益</TableHead>
                        <TableHead className="min-w-[118px]">持有/计划</TableHead>
                        <TableHead className="sticky right-0 z-30 min-w-[120px] text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {funds.map((item) => (
                        <SortableFundRow
                          key={`${item.portfolioId}-${item.fundCode}`}
                          item={item}
                          isBusy={isBusy}
                          onDeleteFund={onDeleteFund}
                          onOpenUpdateDialog={onOpenUpdateDialog}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </SortableContext>
              </DndContext>
            </div>

            <div className="grid gap-3 md:hidden">
              {funds.map((item) => (
                <Card key={`${item.portfolioId}-${item.fundCode}`}>
                  <CardContent className="space-y-3 pt-4">
                    <div className="space-y-1">
                      <p
                        className="overflow-hidden text-sm font-medium leading-5 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                        title={item.fundName ?? `基金 ${item.fundCode}`}
                      >
                        {item.fundName ?? `基金 ${item.fundCode}`}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground">{item.fundCode}</p>
                    </div>

                    <p className="text-sm text-muted-foreground">持仓: ¥{formatCurrency(item.holdingAmount)}</p>
                    <p className="text-sm text-muted-foreground">持有收益: {holdingProfitText(item)}</p>
                    <p className="text-sm text-muted-foreground">
                      当日收益: {dailyProfitText(item)}
                      {item.dailyProfitOfficialUpdated ? <span className="ml-1 text-[10px]">已更新</span> : null}
                    </p>

                    {item.portfolioType === "RATIO" ? (
                      <div className="flex items-center justify-start">
                        {ratioBar(item)}
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => onOpenUpdateDialog(item)} disabled={isBusy}>
                        更新
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={() => onDeleteFund(item)} disabled={isBusy}>
                        删除
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>

      <Dialog open={Boolean(updateTarget)} onOpenChange={(open) => (!open ? setUpdateTarget(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>更新基金</DialogTitle>
          </DialogHeader>
          {updateTarget ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">{updateTarget.fundName ?? `基金 ${updateTarget.fundCode}`}</p>
                <p className="text-xs font-mono text-muted-foreground">{updateTarget.fundCode}</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm text-muted-foreground">持仓金额</p>
                <Input
                  inputMode="decimal"
                  value={getEditState(updateTarget).holdingAmount}
                  onChange={(event) => onEditFieldChange(updateTarget.fundCode, "holdingAmount", event.target.value)}
                  disabled={isBusy}
                  aria-label={`${updateTarget.fundCode} 持仓金额`}
                />
              </div>

              {updateTarget.portfolioType === "RATIO" ? (
                <div className="space-y-1.5">
                  <p className="text-sm text-muted-foreground">计划持有比例(%)</p>
                  <Input
                    inputMode="decimal"
                    value={getEditState(updateTarget).plannedRatio}
                    onChange={(event) => onEditFieldChange(updateTarget.fundCode, "plannedRatio", event.target.value)}
                    disabled={isBusy}
                    aria-label={`${updateTarget.fundCode} 计划比例`}
                  />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <p className="text-sm text-muted-foreground">持有收益金额</p>
                <Input
                  inputMode="decimal"
                  value={getEditState(updateTarget).holdingProfitAmount}
                  onChange={(event) =>
                    onEditFieldChange(updateTarget.fundCode, "holdingProfitAmount", event.target.value)
                  }
                  disabled={isBusy}
                  aria-label={`${updateTarget.fundCode} 持有收益金额`}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setUpdateTarget(null)}>
                  取消
                </Button>
                <Button type="button" onClick={() => void onSubmitUpdate()} disabled={isBusy}>
                  确认更新
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

"use client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DailyDecision,
  PortfolioFundItem,
  PortfolioType,
  PositionOperationType,
} from "@digmo/shared";
import { GripVertical, MoreHorizontal, Pencil, Trash2, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UpdateFundDialog } from "@/components/dashboard/dialogs/update-fund-dialog";
import { FundEditState, formatCurrency, formatSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SortableFundRowProps {
  item: PortfolioFundItem;
  index: number;
  isBusy: boolean;
  onDeleteFund: (item: PortfolioFundItem) => void;
  onOpenUpdateDialog: (item: PortfolioFundItem) => void;
}

function formatSignedCurrencyValue(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}¥${formatCurrency(Math.abs(value))}`;
}

function holdingProfitText(item: PortfolioFundItem) {
  const profit = item.holdingProfitAmount;
  const pct = item.holdingProfitPct;
  const isPositive = profit > 0;
  const isNegative = profit < 0;
  
  return (
    <div className={cn(
      "flex flex-col text-xs",
      isPositive && "text-red-600 dark:text-red-400",
      isNegative && "text-green-600 dark:text-green-400"
    )}>
      <span className="font-mono">{formatSignedCurrencyValue(profit)}</span>
      <span className="font-mono">{formatSignedPct(pct)}</span>
    </div>
  );
}

function dailyProfitText(item: PortfolioFundItem) {
  const pct = typeof item.dailyProfitPct === "number" ? item.dailyProfitPct : item.estimateChangePct ?? 0;
  const amount =
    typeof item.dailyProfitAmount === "number"
      ? item.dailyProfitAmount
      : Number((item.holdingAmount * pct).toFixed(2));
      
  const isPositive = amount > 0;
  const isNegative = amount < 0;

  return (
    <div className={cn(
      "flex flex-col text-xs",
      isPositive && "text-red-600 dark:text-red-400",
      isNegative && "text-green-600 dark:text-green-400"
    )}>
      <span className="font-mono">{formatSignedCurrencyValue(amount)}</span>
      <span className="font-mono">{formatSignedPct(pct)}</span>
      {item.dailyProfitOfficialUpdated && (
        <span className="text-[10px] text-muted-foreground scale-90 origin-left mt-0.5">已更新</span>
      )}
    </div>
  );
}

function ratioCompact(item: PortfolioFundItem) {
  if (
    item.portfolioType !== "RATIO" ||
    typeof item.actualRatio !== "number" ||
    typeof item.plannedRatio !== "number"
  ) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  const actualPct = item.actualRatio * 100;
  const plannedPct = item.plannedRatio * 100;
  const diffPct = actualPct - plannedPct;
  const diffText = `${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}%`;
  const diffVariant =
    diffPct > 0 ? "warning" : diffPct < 0 ? "success" : "secondary";

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-xs text-muted-foreground">
        实 {actualPct.toFixed(1)}% / 计 {plannedPct.toFixed(1)}%
      </span>
      <div>
        <Badge variant={diffVariant} className="h-5 px-1.5 font-mono text-[10px]">
          {diffText}
        </Badge>
      </div>
    </div>
  );
}

function SortableFundRow({
  item,
  index,
  isBusy,
  onDeleteFund,
  onOpenUpdateDialog,
}: SortableFundRowProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.fundCode,
    disabled: isBusy,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const stickyBg = index % 2 !== 0 ? "bg-muted/50" : "bg-background";

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn("group even:bg-muted/50", isDragging && "bg-muted/50 opacity-50")}
    >
      <TableCell className={cn("w-[50px] p-2 sticky left-0 z-10 group-hover:bg-muted/50 group-data-[state=selected]:bg-muted transition-colors", stickyBg)}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 cursor-grab text-muted-foreground active:cursor-grabbing"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={isBusy}
        >
          <GripVertical className="h-4 w-4" />
        </Button>
      </TableCell>

      <TableCell className={cn("w-[180px] min-w-[180px] sticky left-[50px] z-10 group-hover:bg-muted/50 group-data-[state=selected]:bg-muted transition-colors", stickyBg)}>
        <div className="flex flex-col">
          <span className="font-medium truncate max-w-[180px]" title={item.fundName ?? ""}>
            {item.fundName ?? `基金 ${item.fundCode}`}
          </span>
          <span className="text-xs font-mono text-muted-foreground">
            {item.fundCode}
          </span>
        </div>
      </TableCell>

      <TableCell className={cn("w-[120px] min-w-[120px] font-mono sticky left-[230px] z-10 group-hover:bg-muted/50 group-data-[state=selected]:bg-muted transition-colors", stickyBg)}>
        ¥{formatCurrency(item.holdingAmount)}
      </TableCell>
      <TableCell>{holdingProfitText(item)}</TableCell>
      <TableCell>{dailyProfitText(item)}</TableCell>
      <TableCell>{ratioCompact(item)}</TableCell>

      <TableCell className={cn("text-right sticky right-0 z-10 group-hover:bg-muted/50 group-data-[state=selected]:bg-muted transition-colors", stickyBg)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isBusy}>
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">操作</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>操作</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onOpenUpdateDialog(item)}>
              <Pencil className="mr-2 h-4 w-4" />
              更新持仓
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDeleteFund(item)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除基金
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  onEditFieldChange: (
    fundCode: string,
    key: keyof FundEditState,
    value: string
  ) => void;
  onUpdateFund: (item: PortfolioFundItem) => Promise<void>;
  onOperateFund: (
    item: PortfolioFundItem,
    input: {
      operationType: PositionOperationType;
      amountRaw: string;
      bindActionOrder?: number;
    }
  ) => Promise<void>;
  latestDecisionForBinding: DailyDecision | null;
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
  onOperateFund,
  latestDecisionForBinding,
  onDeleteFund,
  onDragEnd,
  onRefresh,
  onOpenAddFundDialog,
}: PortfolioFundsTableProps) {
  const [updateTarget, setUpdateTarget] = useState<PortfolioFundItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const sortableIds = useMemo(() => funds.map((item) => item.fundCode), [funds]);

  function getEditState(item: PortfolioFundItem): FundEditState {
    return (
      editStateMap.get(item.fundCode) ?? {
        holdingAmount: String(item.holdingAmount),
        plannedRatio:
          typeof item.plannedRatio === "number"
            ? String((item.plannedRatio * 100).toFixed(2))
            : "",
        holdingProfitAmount: String(item.holdingProfitAmount),
      }
    );
  }

  function onOpenUpdateDialog(item: PortfolioFundItem) {
    onEditFieldChange(item.fundCode, "holdingAmount", String(item.holdingAmount));
    onEditFieldChange(
      item.fundCode,
      "plannedRatio",
      typeof item.plannedRatio === "number"
        ? String((item.plannedRatio * 100).toFixed(2))
        : ""
    );
    onEditFieldChange(
      item.fundCode,
      "holdingProfitAmount",
      String(item.holdingProfitAmount)
    );
    setUpdateTarget(item);
  }

  return (
    <>
      <Card className="mb-3 flex flex-col border-t-4 border-t-primary/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle className="text-xl">
              {portfolioName}
            </CardTitle>
            <CardDescription>
              {portfolioType === "FREE" ? "自由组合" : "按比例组合"} · 共 {funds.length} 只基金
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onRefresh()}
              disabled={isBusy || isLoading}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
              刷新
            </Button>
            <Button onClick={onOpenAddFundDialog} disabled={isBusy}>
              添加基金
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : funds.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center text-muted-foreground">
              <p>暂无基金</p>
              <Button variant="link" onClick={onOpenAddFundDialog}>
                添加第一只基金
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px] sticky left-0 z-20 bg-background"></TableHead>
                        <TableHead className="w-[180px] min-w-[180px] sticky left-[50px] z-20 bg-background">基金名称</TableHead>
                        <TableHead className="w-[120px] min-w-[120px] sticky left-[230px] z-20 bg-background">持仓金额</TableHead>
                        <TableHead>持有收益</TableHead>
                        <TableHead>当日收益</TableHead>
                        <TableHead>配比</TableHead>
                        <TableHead className="text-right sticky right-0 z-20 bg-background">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {funds.map((item, index) => (
                        <SortableFundRow
                          key={item.fundCode}
                          item={item}
                          index={index}
                          isBusy={isBusy}
                          onDeleteFund={onDeleteFund}
                          onOpenUpdateDialog={onOpenUpdateDialog}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <UpdateFundDialog
        open={Boolean(updateTarget)}
        onOpenChange={(open) => !open && setUpdateTarget(null)}
        target={updateTarget}
        editState={updateTarget ? getEditState(updateTarget) : { holdingAmount: "", plannedRatio: "", holdingProfitAmount: "" }}
        onEditFieldChange={(key, value) =>
          updateTarget && onEditFieldChange(updateTarget.fundCode, key, value)
        }
        onUpdate={async () => {
          if (updateTarget) await onUpdateFund(updateTarget);
        }}
        onOperate={async (type, amount, order) => {
          if (updateTarget) {
            await onOperateFund(updateTarget, {
              operationType: type,
              amountRaw: amount,
              bindActionOrder: order,
            });
          }
        }}
        latestDecisionForBinding={latestDecisionForBinding}
        isBusy={isBusy}
      />
    </>
  );
}

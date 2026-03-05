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
import { GripVertical, Pencil, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FundEditState, formatCurrency, formatPct, formatSignedAmount, formatSignedPct, trendTone } from "@/lib/format";
import { cn } from "@/lib/utils";

type EditableFundFieldKey = "holdingAmount" | "plannedRatio";

interface EditingField {
  fundCode: string;
  key: EditableFundFieldKey;
}

interface SortableFundRowProps {
  item: PortfolioFundItem;
  edit: FundEditState;
  isBusy: boolean;
  editingField: EditingField | null;
  onEditFieldChange: (fundCode: string, key: keyof FundEditState, value: string) => void;
  onDeleteFund: (item: PortfolioFundItem) => void;
  onStartFieldEdit: (item: PortfolioFundItem, key: EditableFundFieldKey) => void;
  onCommitFieldEdit: (item: PortfolioFundItem, key: EditableFundFieldKey) => Promise<void>;
  onCancelFieldEdit: (item: PortfolioFundItem, key: EditableFundFieldKey) => void;
}

function SortableFundRow({
  item,
  edit,
  isBusy,
  editingField,
  onEditFieldChange,
  onDeleteFund,
  onStartFieldEdit,
  onCommitFieldEdit,
  onCancelFieldEdit
}: SortableFundRowProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.fundCode,
    disabled: isBusy
  });

  const isEditingHolding = editingField?.fundCode === item.fundCode && editingField.key === "holdingAmount";
  const isEditingPlanned = editingField?.fundCode === item.fundCode && editingField.key === "plannedRatio";

  return (
    <TableRow
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
      className={cn(isDragging ? "bg-muted" : undefined)}
    >
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`拖拽排序 ${item.fundName ?? item.fundCode}`}
          disabled={isBusy}
        >
          <GripVertical className="h-4 w-4" />
        </Button>
      </TableCell>
      <TableCell>
        <p className="font-medium">{item.fundName ?? `基金 ${item.fundCode}`}</p>
        <p className="text-xs font-mono text-muted-foreground">{item.fundCode}</p>
      </TableCell>
      <TableCell className="align-middle">
        <div className="flex h-9 items-center">
          {isEditingHolding ? (
            <Input
              className="h-9 max-w-[180px] text-sm font-mono"
              autoFocus
              inputMode="decimal"
              value={edit.holdingAmount}
              onChange={(event) => onEditFieldChange(item.fundCode, "holdingAmount", event.target.value)}
              onBlur={() => void onCommitFieldEdit(item, "holdingAmount")}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  (event.currentTarget as HTMLInputElement).blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelFieldEdit(item, "holdingAmount");
                }
              }}
              disabled={isBusy}
              aria-label={`${item.fundCode} 持仓金额`}
            />
          ) : (
            <div className="flex h-9 items-center gap-1">
              <span className="font-mono">¥{formatCurrency(item.holdingAmount)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label={`编辑 ${item.fundCode} 持仓金额`}
                onClick={() => onStartFieldEdit(item, "holdingAmount")}
                disabled={isBusy}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="font-mono">{formatSignedAmount(item.totalProfitAmount)}</TableCell>
      <TableCell className="font-mono">{formatSignedPct(item.totalChangePct)}</TableCell>
      <TableCell className="font-mono">
        <Badge variant={trendTone(item.trend)}>{formatSignedPct(item.estimateChangePct)}</Badge>
      </TableCell>
      <TableCell className="align-middle">
        <div className="flex h-9 items-center">
          {item.portfolioType === "RATIO" ? (
            isEditingPlanned ? (
              <Input
                className="h-9 max-w-[160px] text-sm font-mono"
                autoFocus
                inputMode="decimal"
                value={edit.plannedRatio}
                onChange={(event) => onEditFieldChange(item.fundCode, "plannedRatio", event.target.value)}
                onBlur={() => void onCommitFieldEdit(item, "plannedRatio")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    (event.currentTarget as HTMLInputElement).blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onCancelFieldEdit(item, "plannedRatio");
                  }
                }}
                disabled={isBusy}
                aria-label={`${item.fundCode} 计划比例`}
              />
            ) : (
              <div className="flex h-9 items-center gap-1">
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  计划 {formatPct(item.plannedRatio)} / 实际 {formatPct(item.actualRatio)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label={`编辑 ${item.fundCode} 计划比例`}
                  onClick={() => onStartFieldEdit(item, "plannedRatio")}
                  disabled={isBusy}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Button type="button" size="sm" variant="danger" onClick={() => onDeleteFund(item)} disabled={isBusy}>
          删除
        </Button>
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

function getFieldOriginalValue(item: PortfolioFundItem, key: EditableFundFieldKey): string {
  if (key === "holdingAmount") {
    return String(item.holdingAmount);
  }

  return typeof item.plannedRatio === "number" ? String((item.plannedRatio * 100).toFixed(2)) : "";
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
  const [editingField, setEditingField] = useState<EditingField | null>(null);

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

  function onStartFieldEdit(item: PortfolioFundItem, key: EditableFundFieldKey) {
    setEditingField({ fundCode: item.fundCode, key });
  }

  function onCancelFieldEdit(item: PortfolioFundItem, key: EditableFundFieldKey) {
    onEditFieldChange(item.fundCode, key, getFieldOriginalValue(item, key));
    setEditingField((prev) => {
      if (!prev || prev.fundCode !== item.fundCode || prev.key !== key) {
        return prev;
      }
      return null;
    });
  }

  async function onCommitFieldEdit(item: PortfolioFundItem, key: EditableFundFieldKey) {
    if (!editingField || editingField.fundCode !== item.fundCode || editingField.key !== key) {
      return;
    }

    const edit = editStateMap.get(item.fundCode);
    if (!edit) {
      setEditingField(null);
      return;
    }

    const nextValue = (key === "holdingAmount" ? edit.holdingAmount : edit.plannedRatio).trim();
    const originalValue = getFieldOriginalValue(item, key).trim();

    if (nextValue === originalValue) {
      setEditingField(null);
      return;
    }

    try {
      await onUpdateFund(item);
      setEditingField(null);
    } catch {
      // Keep editing state when validation/update fails, so user can correct input.
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{portfolioName} · {portfolioType === "FREE" ? "自由组合" : "按比例组合"}</CardTitle>
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
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">当前组合暂无基金，请通过“添加基金”按钮添加。</div>
        ) : null}

        {!isLoading && funds.length > 0 ? (
          <>
            <div className="hidden md:block">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>排序</TableHead>
                        <TableHead>基金</TableHead>
                        <TableHead>持仓</TableHead>
                        <TableHead>历史总收益</TableHead>
                        <TableHead>历史总涨跌</TableHead>
                        <TableHead>盘中估算</TableHead>
                        <TableHead>计划/实际</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {funds.map((item) => {
                        const edit = editStateMap.get(item.fundCode) ?? {
                          holdingAmount: String(item.holdingAmount),
                          plannedRatio: typeof item.plannedRatio === "number" ? String((item.plannedRatio * 100).toFixed(2)) : ""
                        };

                        return (
                          <SortableFundRow
                            key={`${item.portfolioId}-${item.fundCode}`}
                            item={item}
                            edit={edit}
                            isBusy={isBusy}
                            editingField={editingField}
                            onEditFieldChange={onEditFieldChange}
                            onDeleteFund={onDeleteFund}
                            onStartFieldEdit={onStartFieldEdit}
                            onCommitFieldEdit={onCommitFieldEdit}
                            onCancelFieldEdit={onCancelFieldEdit}
                          />
                        );
                      })}
                    </TableBody>
                  </Table>
                </SortableContext>
              </DndContext>
            </div>

            <div className="grid gap-3 md:hidden">
              {funds.map((item) => {
                const edit = editStateMap.get(item.fundCode) ?? {
                  holdingAmount: String(item.holdingAmount),
                  plannedRatio: typeof item.plannedRatio === "number" ? String((item.plannedRatio * 100).toFixed(2)) : ""
                };

                const isEditingHolding = editingField?.fundCode === item.fundCode && editingField.key === "holdingAmount";
                const isEditingPlanned = editingField?.fundCode === item.fundCode && editingField.key === "plannedRatio";

                return (
                  <Card key={`${item.portfolioId}-${item.fundCode}`}>
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{item.fundName ?? `基金 ${item.fundCode}`}</p>
                        <Badge variant={trendTone(item.trend)}>{formatSignedPct(item.estimateChangePct)}</Badge>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground">{item.fundCode}</p>

                      <div className="flex h-9 items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">持仓金额</span>
                        {isEditingHolding ? (
                          <Input
                            className="h-9 max-w-[160px] text-sm font-mono"
                            autoFocus
                            inputMode="decimal"
                            value={edit.holdingAmount}
                            onChange={(event) => onEditFieldChange(item.fundCode, "holdingAmount", event.target.value)}
                            onBlur={() => void onCommitFieldEdit(item, "holdingAmount")}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                (event.currentTarget as HTMLInputElement).blur();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                onCancelFieldEdit(item, "holdingAmount");
                              }
                            }}
                            disabled={isBusy}
                            aria-label={`${item.fundCode} 持仓金额`}
                          />
                        ) : (
                          <div className="flex h-9 items-center gap-1">
                            <span className="font-mono text-sm">¥{formatCurrency(item.holdingAmount)}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              aria-label={`编辑 ${item.fundCode} 持仓金额`}
                              onClick={() => onStartFieldEdit(item, "holdingAmount")}
                              disabled={isBusy}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {item.portfolioType === "RATIO" ? (
                        <div className="flex h-9 items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">计划比例</span>
                          {isEditingPlanned ? (
                            <Input
                              className="h-9 max-w-[160px] text-sm font-mono"
                              autoFocus
                              inputMode="decimal"
                              value={edit.plannedRatio}
                              onChange={(event) => onEditFieldChange(item.fundCode, "plannedRatio", event.target.value)}
                              onBlur={() => void onCommitFieldEdit(item, "plannedRatio")}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  (event.currentTarget as HTMLInputElement).blur();
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  onCancelFieldEdit(item, "plannedRatio");
                                }
                              }}
                              disabled={isBusy}
                              aria-label={`${item.fundCode} 计划比例`}
                            />
                          ) : (
                            <div className="flex h-9 items-center gap-1">
                              <span className="text-xs text-muted-foreground">{formatPct(item.plannedRatio)} / 实际 {formatPct(item.actualRatio)}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                aria-label={`编辑 ${item.fundCode} 计划比例`}
                                onClick={() => onStartFieldEdit(item, "plannedRatio")}
                                disabled={isBusy}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : null}

                      <Button type="button" variant="danger" size="sm" onClick={() => onDeleteFund(item)} disabled={isBusy}>
                        删除
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

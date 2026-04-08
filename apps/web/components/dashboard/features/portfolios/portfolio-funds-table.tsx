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
  PortfolioFundItem,
  PortfolioType,
  PositionOperationType,
} from "@digmo/shared";
import {
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  HistoryOutlined,
  PlusOutlined,
  ShareAltOutlined,
  HolderOutlined,
} from "@ant-design/icons";
import React, { useMemo, useState, useContext, createContext } from "react";

import {
  Button,
  Card,
  Table,
  Tag,
  Dropdown,
  Typography,
  Space,
  Skeleton,
  Empty,
  Tooltip,
} from "antd";
import type { TableProps, MenuProps } from "antd";

import { FundOperationHistoryDialog } from "@/components/dashboard/dialogs/fund-operation-history-dialog";
import { UpdateFundDialog } from "@/components/dashboard/dialogs/update-fund-dialog";
import { FundEditState, formatCurrency, formatPct, formatSignedPct } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-is-mobile";

const { Text, Title } = Typography;
const CASH_ROW_KEY = "__portfolio_cash_placeholder__";

interface PortfolioFundsTableProps {
  portfolioName: string;
  portfolioType: PortfolioType;
  portfolioTotalAsset?: number;
  portfolioCashAmount?: number;
  portfolioCashRatio?: number;
  funds: PortfolioFundItem[];
  editStateMap: Map<string, FundEditState>;
  isBusy: boolean;
  isLoading: boolean;
  onEditFieldChange: (
    fundCode: string,
    key: keyof FundEditState,
    value: string,
  ) => void;
  onUpdateFund: (item: PortfolioFundItem) => Promise<void>;
  onOperateFund: (
    item: PortfolioFundItem,
    input: {
      operationType: PositionOperationType;
      amountRaw: string;
    },
  ) => Promise<void>;
  onDeleteFund: (item: PortfolioFundItem) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onOpenAddFundDialog: () => void;
  onOpenShareDialog: () => void;
  onOpenUpdateTotalAssetDialog?: () => void;
  onDeletePortfolio: () => void;
}

function formatSignedCurrencyValue(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}¥${formatCurrency(Math.abs(value))}`;
}

// Row Context for DnD Handle
interface RowContextProps {
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
  listeners?: Record<string, any>;
}

const RowContext = createContext<RowContextProps>({});

// Row component for DnD
interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  "data-row-key": string;
}

interface CashDisplayRow {
  key: typeof CASH_ROW_KEY;
  rowType: "cash";
  cashPlannedRatio: number;
  cashActualRatio?: number;
  cashAmount?: number;
}

interface FundDisplayRow extends PortfolioFundItem {
  key: string;
  rowType: "fund";
}

type DisplayRow = CashDisplayRow | FundDisplayRow;

function isCashDisplayRow(record: DisplayRow): record is CashDisplayRow {
  return record.rowType === "cash";
}

const SortableRow = ({ children, ...props }: RowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props["data-row-key"],
  });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 9999 } : {}),
  };

  return (
    <RowContext.Provider value={{ setActivatorNodeRef, listeners }}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes}>
        {children}
      </tr>
    </RowContext.Provider>
  );
};

const StaticRow = ({ children, ...props }: RowProps) => (
  <tr {...props}>{children}</tr>
);

const BodyRow = (props: RowProps) => {
  if (props["data-row-key"] === CASH_ROW_KEY) {
    return <StaticRow {...props} />;
  }
  return <SortableRow {...props} />;
};

// Drag Handle Component
const DragHandle = () => {
  const { setActivatorNodeRef, listeners } = useContext(RowContext);
  return (
    <Button
      type="text"
      size="small"
      icon={<HolderOutlined />}
      style={{ cursor: "grab" }}
      ref={setActivatorNodeRef}
      {...listeners}
    />
  );
};

export function PortfolioFundsTable({
  portfolioName,
  portfolioType,
  portfolioTotalAsset,
  portfolioCashAmount,
  portfolioCashRatio,
  funds,
  editStateMap,
  isBusy,
  isLoading,
  onEditFieldChange,
  onUpdateFund,
  onOperateFund,
  onDeleteFund,
  onDragEnd,
  onOpenAddFundDialog,
  onOpenShareDialog,
  onOpenUpdateTotalAssetDialog,
  onDeletePortfolio,
}: PortfolioFundsTableProps) {
  const [updateTarget, setUpdateTarget] = useState<PortfolioFundItem | null>(
    null,
  );
  const [historyTarget, setHistoryTarget] = useState<PortfolioFundItem | null>(
    null,
  );
  const isMobile = useIsMobile();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
  );

  const sortableIds = useMemo(
    () => funds.map((item) => item.fundCode),
    [funds],
  );
  const ratioSummary = useMemo(() => {
    if (portfolioType !== "RATIO") {
      return null;
    }

    const hasCompletePlannedRatios = funds.every(
      (item) => typeof item.plannedRatio === "number",
    );
    if (!hasCompletePlannedRatios) {
      return null;
    }

    const allocatedRatio = Number(
      funds
        .reduce((sum, item) => sum + (item.plannedRatio ?? 0), 0)
        .toFixed(6),
    );
    const cashRatio = Number(Math.max(0, 1 - allocatedRatio).toFixed(6));

    return {
      allocatedRatio,
      cashRatio,
      showCashRow: funds.length > 0 && cashRatio > 0,
    };
  }, [funds, portfolioType]);
  const displayTotalAsset =
    typeof portfolioTotalAsset === "number" ? portfolioTotalAsset : undefined;
  const displayCashAmount =
    typeof portfolioCashAmount === "number" ? portfolioCashAmount : undefined;
  const displayCashRatio =
    typeof portfolioCashRatio === "number" ? portfolioCashRatio : undefined;
  const displayRows = useMemo<DisplayRow[]>(() => {
    const fundRows: FundDisplayRow[] = funds.map((item) => ({
      ...item,
      key: item.fundCode,
      rowType: "fund",
    }));

    if (!ratioSummary?.showCashRow) {
      return fundRows;
    }

    return [
      {
        key: CASH_ROW_KEY,
        rowType: "cash",
        cashPlannedRatio: ratioSummary.cashRatio,
        ...(typeof displayCashRatio === "number"
          ? { cashActualRatio: displayCashRatio }
          : {}),
        ...(typeof displayCashAmount === "number"
          ? { cashAmount: displayCashAmount }
          : {}),
      },
      ...fundRows,
    ];
  }, [displayCashAmount, displayCashRatio, funds, ratioSummary]);
  const portfolioMenuItems: MenuProps["items"] = [
    ...(onOpenUpdateTotalAssetDialog
      ? [
          {
            key: "update-total-asset",
            label: "更新总资产",
            icon: <EditOutlined />,
            onClick: onOpenUpdateTotalAssetDialog,
          },
          { type: "divider" as const },
        ]
      : []),
    {
      key: "delete-portfolio",
      label: "删除组合",
      icon: <DeleteOutlined />,
      danger: true,
      onClick: onDeletePortfolio,
    },
  ];

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
    onEditFieldChange(
      item.fundCode,
      "holdingAmount",
      String(item.holdingAmount),
    );
    onEditFieldChange(
      item.fundCode,
      "plannedRatio",
      typeof item.plannedRatio === "number"
        ? String((item.plannedRatio * 100).toFixed(2))
        : "",
    );
    onEditFieldChange(
      item.fundCode,
      "holdingProfitAmount",
      String(item.holdingProfitAmount),
    );
    setUpdateTarget(item);
  }

  const columns: TableProps<DisplayRow>["columns"] = [
    ...(isMobile
      ? []
      : [
          {
            key: "sort",
            width: 50,
            fixed: "left" as const,
            render: (_: unknown, record: DisplayRow) =>
              isCashDisplayRow(record) ? null : <DragHandle />,
          },
        ]),
    {
      title: "基金名称",
      key: "name",
      width: isMobile ? 86 : 140,
      fixed: "left",
      render: (_, record) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {isCashDisplayRow(record) ? (
            <>
              <Space size={4} orientation="vertical" align="center">
                <Tag color="gold" style={{ margin: 0, fontSize: isMobile ? 10 : 12 }}>
                  现金
                </Tag>
                <Text
                  strong
                  style={{ fontSize: isMobile ? 12 : 14 }}
                >
                  现金 / 待配置
                </Text>
              </Space>
            </>
          ) : (
            <>
          <Text
            strong
            ellipsis={{ tooltip: record.fundName }}
            style={{ fontSize: isMobile ? 12 : 14 }}
          >
            {record.fundName ?? `基金 ${record.fundCode}`}
          </Text>
          <Text type="secondary" style={{ fontSize: isMobile ? 10 : 12 }}>
            {record.fundCode}
          </Text>
            </>
          )}
        </div>
      ),
    },
    {
      title: "持仓金额",
      dataIndex: "holdingAmount",
      key: "holdingAmount",
      align: "center",
      width: isMobile ? 86 : 120,
      render: (value, record) =>
        isCashDisplayRow(record)
          ? typeof record.cashAmount === "number"
            ? `¥${formatCurrency(record.cashAmount)}`
            : "-"
          : `¥${formatCurrency(value as number)}`,
    },
    {
      title: "持有收益",
      key: "holdingProfit",
      align: "center",
      width: isMobile ? 86 : 120,
      render: (_, record) => {
        if (isCashDisplayRow(record)) {
          return "-";
        }
        const profit = record.holdingProfitAmount;
        const pct = record.holdingProfitPct;
        const color =
          profit > 0 ? "#cf1322" : profit < 0 ? "#389e0d" : "inherit";
        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              fontSize: 12,
              color,
            }}
          >
            <span>{formatSignedCurrencyValue(profit)}</span>
            <span>{formatSignedPct(pct)}</span>
          </div>
        );
      },
    },
    {
      title: "当日收益",
      key: "dailyProfit",
      align: "center",
      width: isMobile ? 86 : 120,
      render: (_, record) => {
        if (isCashDisplayRow(record)) {
          return "-";
        }
        const pct =
          typeof record.dailyProfitPct === "number"
            ? record.dailyProfitPct
            : typeof record.estimateChangePct === "number"
              ? record.estimateChangePct
              : undefined;
        const amount =
          typeof record.dailyProfitAmount === "number"
            ? record.dailyProfitAmount
            : typeof pct === "number"
              ? Number((record.holdingAmount * pct).toFixed(2))
              : undefined;
        const color =
          typeof amount === "number"
            ? amount > 0
              ? "#cf1322"
              : amount < 0
                ? "#389e0d"
                : "inherit"
            : "inherit";
        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              fontSize: 12,
              color,
            }}
          >
            <span>{formatSignedCurrencyValue(amount)}</span>
            <span>{formatSignedPct(pct)}</span>
            {record.dailyProfitOfficialUpdated && (
              <Text type="secondary" style={{ fontSize: 10 }}>
                已更新
              </Text>
            )}
          </div>
        );
      },
    },
    ...(portfolioType === "RATIO"
      ? [
          {
            title: "配比",
            key: "ratio",
            align: "center" as const,
            width: isMobile ? 86 : 120,
            render: (_: unknown, record: DisplayRow) => {
              if (isCashDisplayRow(record)) {
                const actualPct =
                  typeof record.cashActualRatio === "number"
                    ? record.cashActualRatio * 100
                    : undefined;
                const plannedPct = record.cashPlannedRatio * 100;
                const diffPct =
                  typeof actualPct === "number"
                    ? actualPct - plannedPct
                    : undefined;
                const diffText =
                  typeof diffPct === "number"
                    ? `${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}%`
                    : undefined;
                const color =
                  typeof diffPct === "number"
                    ? diffPct > 0
                      ? "orange"
                      : diffPct < 0
                        ? "green"
                        : "default"
                    : "default";
                return (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      gap: 4,
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {typeof actualPct === "number"
                        ? `${actualPct.toFixed(1)}%/${plannedPct.toFixed(1)}%`
                        : `计划 ${formatPct(record.cashPlannedRatio)}`}
                    </Text>
                    {diffText ? (
                      <div>
                        <Tag color={color} style={{ margin: 0, fontSize: 10 }}>
                          {diffText}
                        </Tag>
                      </div>
                    ) : null}
                  </div>
                );
              }
              if (
                typeof record.actualRatio !== "number" ||
                typeof record.plannedRatio !== "number"
              ) {
                return <Text type="secondary">-</Text>;
              }
              const actualPct = record.actualRatio * 100;
              const plannedPct = record.plannedRatio * 100;
              const diffPct = actualPct - plannedPct;
              const diffText = `${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}%`;
              const color =
                diffPct > 0 ? "orange" : diffPct < 0 ? "green" : "default";

              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    gap: 4,
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {actualPct.toFixed(1)}%/{plannedPct.toFixed(1)}%
                  </Text>
                  <div>
                    <Tag color={color} style={{ margin: 0, fontSize: 10 }}>
                      {diffText}
                    </Tag>
                  </div>
                </div>
              );
            },
          },
        ]
      : []),
    {
      title: "操作",
      key: "action",
      fixed: "right",
      align: "center",
      width: isMobile ? 36 : 60,
      render: (_, record) => {
        if (isCashDisplayRow(record)) {
          return null;
        }
        const items: MenuProps["items"] = [
          {
            key: "update",
            label: "更新持仓",
            icon: <EditOutlined />,
            onClick: () => onOpenUpdateDialog(record),
          },
          {
            key: "history",
            label: "更新记录",
            icon: <HistoryOutlined />,
            onClick: () => setHistoryTarget(record),
          },
          { type: "divider" },
          {
            key: "delete",
            label: "删除基金",
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => onDeleteFund(record),
          },
        ];
        return (
          <Dropdown
            menu={{ items }}
            placement="bottomRight"
            trigger={["click"]}
          >
            <Button
              type="text"
              icon={<MoreOutlined />}
              size={isMobile ? "small" : "middle"}
            />
          </Dropdown>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }

  return (
    <>
      <Card
        title={
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <Title
                level={isMobile ? 5 : 5}
                style={{ margin: 0, fontSize: isMobile ? 14 : 16 }}
              >
                {portfolioType === "FREE" ? "自由组合" : "按比例组合"}
                {ratioSummary && <span> · {ratioSummary.cashRatio > 0
                  ? `现金 ${formatPct(ratioSummary.cashRatio)}`
                  : "已满配"}</span>}
              </Title>
              {typeof displayTotalAsset === "number" ? (
                <Text
                  type="secondary"
                  style={{
                    display: "block",
                    marginTop: 4,
                    fontSize: isMobile ? 10 : 12,
                  }}
                >
                  总额 {formatCurrency(displayTotalAsset)}
                  {typeof displayCashAmount === "number"
                    ? `/现金 ${formatCurrency(displayCashAmount)}${
                        typeof displayCashRatio === "number"
                          ? ` (${formatPct(displayCashRatio)})`
                          : ""
                      }`
                    : ""}
                </Text>
              ) : null}
              {/*<Text type="secondary" style={{ fontSize: isMobile ? 10 : 12, fontWeight: 'normal' }}>*/}
              {/*   {portfolioType === "FREE" ? "自由组合" : "按比例组合"} · 共 {funds.length} 只基金*/}
              {/*</Text>*/}
            </div>
            <Space>
              <Tooltip title={`分享${portfolioName}`}>
                <Button
                  aria-label={`分享组合 ${portfolioName}`}
                  icon={<ShareAltOutlined />}
                  onClick={onOpenShareDialog}
                  disabled={isBusy}
                  size={isMobile ? "small" : "middle"}
                  style={{
                    width: isMobile ? 36 : 40,
                    height: isMobile ? 24 : 40,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                />
              </Tooltip>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={onOpenAddFundDialog}
                disabled={isBusy}
                size={isMobile ? "small" : "middle"}
                >
                  {isMobile ? "" : "添加基金"}
                </Button>
              <Dropdown
                menu={{ items: portfolioMenuItems }}
                placement="bottomRight"
                trigger={["click"]}
              >
                <Button
                  aria-label="组合更多操作"
                  icon={<MoreOutlined />}
                  disabled={isBusy}
                  size={isMobile ? "small" : "middle"}
                />
              </Dropdown>
            </Space>
          </div>
        }
        style={{ marginBottom: 24, borderTop: "4px solid #1677ff" }}
        styles={{
          body: {
            padding: isMobile ? 12 : 24,
          },
          header: {
            padding: "0 14px",
          },
        }}
      >
        {funds.length === 0 ? (
          <Empty description="暂无基金" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button type="primary" onClick={onOpenAddFundDialog}>
              添加第一只基金
            </Button>
          </Empty>
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
              <Table
                columns={columns}
                dataSource={displayRows}
                rowKey="key"
                pagination={false}
                scroll={{ x: isMobile ? 640 : 800 }}
                size={isMobile ? "small" : "middle"}
                onRow={(record) =>
                  isCashDisplayRow(record)
                    ? {
                        style: {
                          backgroundColor: "#fafafa",
                        },
                      }
                    : {}
                }
                components={{
                  body: {
                    row: BodyRow,
                  },
                }}
              />
            </SortableContext>
          </DndContext>
        )}
      </Card>

      <UpdateFundDialog
        open={Boolean(updateTarget)}
        onOpenChange={(open) => !open && setUpdateTarget(null)}
        target={updateTarget}
        editState={
          updateTarget
            ? getEditState(updateTarget)
            : { holdingAmount: "", plannedRatio: "", holdingProfitAmount: "" }
        }
        onEditFieldChange={(key, value) =>
          updateTarget && onEditFieldChange(updateTarget.fundCode, key, value)
        }
        onUpdate={async () => {
          if (updateTarget) await onUpdateFund(updateTarget);
        }}
        onOperate={async (type, amount) => {
          if (updateTarget) {
            await onOperateFund(updateTarget, {
              operationType: type,
              amountRaw: amount,
            });
          }
        }}
        isBusy={isBusy}
      />

      <FundOperationHistoryDialog
        open={Boolean(historyTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryTarget(null);
          }
        }}
        portfolioId={historyTarget?.portfolioId}
        fundCode={historyTarget?.fundCode}
        fundName={historyTarget?.fundName}
      />
    </>
  );
}

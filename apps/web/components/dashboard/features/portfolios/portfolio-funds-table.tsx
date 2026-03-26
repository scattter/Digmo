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
import { FundEditState, formatCurrency, formatSignedPct } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-is-mobile";

const { Text, Title } = Typography;

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

  const columns: TableProps<PortfolioFundItem>["columns"] = [
    ...(isMobile
      ? []
      : [
          {
            key: "sort",
            width: 50,
            fixed: "left" as const,
            render: () => <DragHandle />,
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
        </div>
      ),
    },
    {
      title: "持仓金额",
      dataIndex: "holdingAmount",
      key: "holdingAmount",
      align: "center",
      width: isMobile ? 86 : 120,
      render: (value) => `¥${formatCurrency(value)}`,
    },
    {
      title: "持有收益",
      key: "holdingProfit",
      align: "center",
      width: isMobile ? 86 : 120,
      render: (_, record) => {
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
            render: (_: unknown, record: PortfolioFundItem) => {
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
                {portfolioType === "FREE" ? "自由组合" : "按比例组合"} ·{" "}
                {funds.length} 只
              </Title>
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
                {isMobile ? "添加" : "添加基金"}
              </Button>
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
                dataSource={funds}
                rowKey="fundCode"
                pagination={false}
                scroll={{ x: isMobile ? 640 : 800 }}
                size={isMobile ? "small" : "middle"}
                components={{
                  body: {
                    row: SortableRow,
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

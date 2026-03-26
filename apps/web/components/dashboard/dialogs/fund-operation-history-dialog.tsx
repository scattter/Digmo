"use client";

import { DeleteOutlined } from "@ant-design/icons";
import { PositionOperationRecord } from "@digmo/shared";
import { useCallback, useEffect, useState } from "react";
import { App, Button, Empty, Modal, Popconfirm, Space, Spin, Tag, Typography, theme } from "antd";

import { deletePositionOperation, fetchPositionOperations } from "@/lib/api";
import { formatBeijingTime, formatCurrency } from "@/lib/format";

const { Paragraph, Text, Title } = Typography;

interface FundOperationHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolioId?: string;
  fundCode?: string;
  fundName?: string;
}

function formatAuditCurrency(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}¥${formatCurrency(Math.abs(value))}`;
}

function getStatusMeta(item: PositionOperationRecord, token: ReturnType<typeof theme.useToken>["token"]) {
  if (item.manualCanceledAt) {
    return {
      label: "手动取消",
      textColor: token.colorText,
      borderColor: token.colorBorderSecondary,
      backgroundColor: token.colorFillQuaternary,
      accentColor: token.colorTextTertiary
    };
  }

  if (item.status === "PENDING") {
    return {
      label: "待生效",
      textColor: token.colorWarningText,
      borderColor: token.colorWarningBorder,
      backgroundColor: token.colorWarningBg,
      accentColor: token.colorWarning
    };
  }

  return {
    label: "已生效",
    textColor: token.colorSuccessText,
    borderColor: token.colorSuccessBorder,
    backgroundColor: token.colorSuccessBg,
    accentColor: token.colorSuccess
  };
}

function getDeleteConfirmationText(item: PositionOperationRecord): string {
  if (item.status === "PENDING") {
    return "删除后该条待生效记录不会在次日结算，是否继续？";
  }
  return "该记录已经生效，删除不会回滚持仓，只会追加“手动取消”标识，是否继续？";
}

export function FundOperationHistoryDialog(props: FundOperationHistoryDialogProps) {
  const { open, onOpenChange, portfolioId, fundCode, fundName } = props;
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [items, setItems] = useState<PositionOperationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!portfolioId || !fundCode) {
      setItems([]);
      return;
    }

    setIsLoading(true);
    try {
      const nextItems = await fetchPositionOperations(portfolioId, {
        fundCode,
        limit: 50
      });
      setItems(nextItems);
    } catch (error) {
      const text = error instanceof Error ? error.message : "加载更新记录失败";
      message.error(text);
    } finally {
      setIsLoading(false);
    }
  }, [fundCode, message, portfolioId]);

  useEffect(() => {
    if (open) {
      void loadHistory();
      return;
    }

    setDeletingId(null);
  }, [loadHistory, open]);

  async function handleDelete(item: PositionOperationRecord) {
    if (!portfolioId || !fundCode) {
      return;
    }

    setDeletingId(item.id);
    try {
      const result = await deletePositionOperation(portfolioId, fundCode, item.id);
      await loadHistory();
      message.success(
        result.effect === "REMOVED"
          ? "待生效记录已删除，后续不会结算。"
          : "该记录已标记为手动取消，已生效持仓保持不变。"
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : "删除更新记录失败";
      message.error(text);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Modal
      title={
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Title level={5} style={{ margin: 0 }}>
            更新记录
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {fundName ?? (fundCode ? `基金 ${fundCode}` : "基金")} · 按创建时间倒序展示
          </Text>
        </div>
      }
      open={open}
      onCancel={() => onOpenChange(false)}
      width={760}
      footer={[
        <Button key="close" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      ]}
      centered
      styles={{
        body: {
          padding: 20,
          maxHeight: "72vh",
          overflowY: "auto",
          background: token.colorBgLayout
        }
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          这里记录加仓/减仓的生效轨迹。待生效记录删除后不会在次日结算；已生效记录删除时仅追加“手动取消”标识。
        </Paragraph>

        {isLoading ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Spin description="加载更新记录中..." />
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadiusLG,
              background: token.colorBgContainer,
              padding: 32
            }}
          >
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无更新记录"
            />
          </div>
        ) : (
          items.map((item) => {
            const statusMeta = getStatusMeta(item, token);
            const actionLabel = item.operationType === "INCREASE" ? "加仓" : "减仓";
            const isDeleting = deletingId === item.id;

            return (
              <div
                key={item.id}
                style={{
                  border: `1px solid ${statusMeta.borderColor}`,
                  borderRadius: token.borderRadiusLG,
                  background: token.colorBgContainer,
                  padding: 16,
                  boxShadow: `inset 3px 0 0 ${statusMeta.accentColor}`
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Space size={8} wrap>
                      <Text strong>{actionLabel}</Text>
                      <Text style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatAuditCurrency(item.amount)}
                      </Text>
                    </Space>
                    <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        持仓金额 {formatAuditCurrency(item.beforeHoldingAmount)} {"->"}{" "}
                        {formatAuditCurrency(item.afterHoldingAmount)}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        持有收益 {formatAuditCurrency(item.beforeHoldingProfitAmount)} {"->"}{" "}
                        {formatAuditCurrency(item.afterHoldingProfitAmount)}
                      </Text>
                    </div>
                  </div>
                  <Tag
                    bordered={false}
                    style={{
                      marginInlineEnd: 0,
                      paddingInline: 10,
                      paddingBlock: 2,
                      borderRadius: 999,
                      color: statusMeta.textColor,
                      background: statusMeta.backgroundColor
                    }}
                  >
                    {statusMeta.label}
                  </Tag>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                    display: "grid",
                    gap: 4
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    创建时间：{formatBeijingTime(item.createdAt)}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    生效时间：{formatBeijingTime(item.effectiveAt)}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    实际生效：{item.appliedAt ? formatBeijingTime(item.appliedAt) : "尚未生效"}
                  </Text>
                  {item.manualCanceledAt ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      手动取消：{formatBeijingTime(item.manualCanceledAt)}
                    </Text>
                  ) : null}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    justifyContent: "flex-end"
                  }}
                >
                  {item.manualCanceledAt ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      已保留审计标记
                    </Text>
                  ) : (
                    <Popconfirm
                      title="确认删除这条更新记录？"
                      description={getDeleteConfirmationText(item)}
                      okText="确认"
                      cancelText="取消"
                      okButtonProps={{ danger: true, loading: isDeleting }}
                      onConfirm={() => void handleDelete(item)}
                    >
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        loading={isDeleting}
                      >
                        删除记录
                      </Button>
                    </Popconfirm>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}

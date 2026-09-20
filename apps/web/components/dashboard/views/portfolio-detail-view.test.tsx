import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyDecision, PortfolioDecisionDoc, PortfolioSummary } from "@digmo/shared";
import { PortfolioDetailView } from "./portfolio-detail-view";

const api = vi.hoisted(() => ({
  fetchDailyDecisionHistory: vi.fn(), fetchDecisionDoc: vi.fn(), fetchLatestDailyDecision: vi.fn(),
  generateDailyDecision: vi.fn(), upsertDecisionDoc: vi.fn()
}));
const message = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock("@/lib/api", () => ({ ...api, ApiResponseError: class extends Error {} }));
vi.mock("@/hooks/use-is-mobile", () => ({ useIsMobile: () => false }));
vi.mock("antd", () => ({
  App: { useApp: () => ({ message }) },
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Typography: { Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>, Title: () => null },
  Button: ({ children, onClick, disabled }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button onClick={onClick} disabled={disabled}>{children}</button>,
  Modal: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  Spin: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Input: () => null
}));
vi.mock("../cards/plan-completion-card", () => ({ PlanCompletionCard: () => null }));
vi.mock("../features/portfolios/portfolio-funds-table", () => ({ PortfolioFundsTable: () => null }));
vi.mock("../dialogs/decision-history-dialog", () => ({ DecisionHistoryDialog: () => null }));
vi.mock("../features/decision/daily-decision-panel", () => ({
  DailyDecisionPanel: ({ docContent, onSaveDoc }: { docContent: string; onSaveDoc: () => Promise<void> }) =>
    <div><span>{docContent}</span><button onClick={() => void onSaveDoc()}>保存文档</button></div>
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function doc(id: string) {
  return { portfolioId: id, content: `${id} 策略`, format: "TEXT", version: 1 } as PortfolioDecisionDoc;
}
function props(id: string): ComponentProps<typeof PortfolioDetailView> {
  return {
    portfolio: { id, name: id, type: "FREE", totalAmount: 100 } as PortfolioSummary,
    funds: [], editStateMap: new Map(), isBusy: false, isLoading: false, decisionAiConfigured: true,
    onEditFieldChange: vi.fn(), onUpdateFund: vi.fn(), onOperateFund: vi.fn(), onDeleteFund: vi.fn(),
    onDragEnd: vi.fn(), onOpenAddFundDialog: vi.fn(), onOpenShareDialog: vi.fn(), onDeletePortfolio: vi.fn(),
    onUpdatePortfolioTotalAsset: vi.fn(), onOpenDecisionAiConfig: vi.fn()
  };
}

afterEach(cleanup);

describe("PortfolioDetailView async isolation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.fetchDecisionDoc.mockImplementation((id: string) => Promise.resolve(doc(id)));
    api.fetchLatestDailyDecision.mockResolvedValue(null);
    api.fetchDailyDecisionHistory.mockResolvedValue([]);
  });

  it("aborts old reads and keeps the new portfolio isolated from their late failures", async () => {
    const old = deferred<PortfolioDecisionDoc>();
    api.fetchDecisionDoc.mockImplementationOnce(() => old.promise);
    const { rerender } = render(<PortfolioDetailView key="A" {...props("A")} />);
    const signal = api.fetchDecisionDoc.mock.calls[0][1] as AbortSignal;
    rerender(<PortfolioDetailView key="B" {...props("B")} />);
    await waitFor(() => expect(screen.getByText("管理文档")).not.toBeDisabled());
    fireEvent.click(screen.getByText("管理文档"));
    expect(screen.getByText("B 策略")).toBeInTheDocument();
    expect(signal.aborted).toBe(true);
    await act(async () => { old.reject(new Error("A 失败")); });
    expect(message.error).not.toHaveBeenCalled();
    expect(screen.getByText("B 策略")).toBeInTheDocument();
  });

  it("does not carry a saved document or its notification into a different portfolio", async () => {
    const save = deferred<PortfolioDecisionDoc>();
    api.upsertDecisionDoc.mockReturnValue(save.promise);
    const { rerender } = render(<PortfolioDetailView key="A" {...props("A")} />);
    await waitFor(() => expect(screen.getByText("管理文档")).not.toBeDisabled());
    fireEvent.click(screen.getByText("管理文档"));
    fireEvent.click(screen.getByText("保存文档"));
    expect(api.upsertDecisionDoc).toHaveBeenCalledWith(expect.objectContaining({ portfolioId: "A" }));
    rerender(<PortfolioDetailView key="B" {...props("B")} />);
    await waitFor(() => expect(screen.getByText("管理文档")).not.toBeDisabled());
    expect(screen.queryByText("保存文档")).not.toBeInTheDocument();
    await act(async () => { save.resolve(doc("A")); });
    expect(message.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("管理文档"));
    expect(screen.getByText("B 策略")).toBeInTheDocument();
  });

  it("does not show an old portfolio's generated suggestion after switching", async () => {
    const generated = deferred<DailyDecision>();
    api.generateDailyDecision.mockReturnValue(generated.promise);
    const { rerender } = render(<PortfolioDetailView key="A" {...props("A")} />);
    await waitFor(() => expect(screen.getByText("更新建议")).not.toBeDisabled());
    fireEvent.click(screen.getByText("更新建议"));
    rerender(<PortfolioDetailView key="B" {...props("B")} />);
    await waitFor(() => expect(screen.getByText("更新建议")).not.toBeDisabled());
    await act(async () => { generated.resolve({ id: "A", summary: "A 的建议" } as DailyDecision); });
    expect(screen.queryByText("A 的建议")).not.toBeInTheDocument();
    expect(message.success).not.toHaveBeenCalled();
  });
});

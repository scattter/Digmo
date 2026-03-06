import { PortfolioSummary } from "@digmo/shared";
import { Pencil, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatSignedPct } from "@/lib/format";

interface PortfolioOverviewTableProps {
  portfolios: PortfolioSummary[];
  isLoading: boolean;
  isBusy: boolean;
  editingPortfolioId: string | null;
  editingPortfolioName: string;
  onOpen: (portfolio: PortfolioSummary) => void;
  onDelete: (portfolio: PortfolioSummary) => void;
  onStartRename: (portfolio: PortfolioSummary) => void;
  onRenameInputChange: (value: string) => void;
  onCommitRename: (portfolio: PortfolioSummary) => Promise<void> | void;
  onCancelRename: () => void;
  onRefresh: () => Promise<void>;
}

function compactProfitDisplay(input: string): string {
  return input.replace(/\s*\/\s*/g, "/");
}

function EditablePortfolioName(props: {
  portfolio: PortfolioSummary;
  editingPortfolioId: string | null;
  editingPortfolioName: string;
  isBusy: boolean;
  onOpen: (portfolio: PortfolioSummary) => void;
  onStartRename: (portfolio: PortfolioSummary) => void;
  onRenameInputChange: (value: string) => void;
  onCommitRename: (portfolio: PortfolioSummary) => Promise<void> | void;
  onCancelRename: () => void;
}) {
  const {
    portfolio,
    editingPortfolioId,
    editingPortfolioName,
    isBusy,
    onOpen,
    onStartRename,
    onRenameInputChange,
    onCommitRename,
    onCancelRename
  } = props;

  const isEditing = editingPortfolioId === portfolio.id;

  if (isEditing) {
    return (
      <Input
        className="h-9 text-sm"
        autoFocus
        value={editingPortfolioName}
        onChange={(event) => onRenameInputChange(event.target.value)}
        onBlur={() => void onCommitRename(portfolio)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.currentTarget as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancelRename();
          }
        }}
        disabled={isBusy}
        maxLength={32}
        aria-label={`编辑组合名称 ${portfolio.name}`}
      />
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="text-left text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpen(portfolio)}
      >
        {portfolio.name}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label={`编辑组合名称 ${portfolio.name}`}
        onClick={() => onStartRename(portfolio)}
        disabled={isBusy}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function PortfolioOverviewTable({
  portfolios,
  isLoading,
  isBusy,
  editingPortfolioId,
  editingPortfolioName,
  onOpen,
  onDelete,
  onStartRename,
  onRenameInputChange,
  onCommitRename,
  onCancelRename,
  onRefresh
}: PortfolioOverviewTableProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">全部组合</CardTitle>
        <Button type="button" variant="secondary" size="sm" onClick={() => void onRefresh()} disabled={isBusy}>
          <RefreshCw className="h-4 w-4" />
          手动更新
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : null}

        {!isLoading && portfolios.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">暂无组合，请先创建组合。</div>
        ) : null}

        {!isLoading && portfolios.length > 0 ? (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader className="[&_tr]:bg-muted/60">
                  <TableRow className="hover:bg-muted/60">
                    <TableHead>组合</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead className="text-right">总金额</TableHead>
                    <TableHead className="text-right">总收益</TableHead>
                    <TableHead className="text-right">当日收益</TableHead>
                    <TableHead className="text-right">基金数</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr:nth-child(even)]:bg-muted/20">
                  {portfolios.map((portfolio) => (
                    <TableRow key={portfolio.id}>
                      <TableCell>
                        <EditablePortfolioName
                          portfolio={portfolio}
                          editingPortfolioId={editingPortfolioId}
                          editingPortfolioName={editingPortfolioName}
                          isBusy={isBusy}
                          onOpen={onOpen}
                          onStartRename={onStartRename}
                          onRenameInputChange={onRenameInputChange}
                          onCommitRename={onCommitRename}
                          onCancelRename={onCancelRename}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{portfolio.type === "FREE" ? "自由" : "按比例"}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">¥{formatCurrency(portfolio.totalAmount)}</TableCell>
                      <TableCell className="text-right font-mono">{compactProfitDisplay(portfolio.totalProfitDisplay)}</TableCell>
                      <TableCell className="text-right font-mono">
                        <span>{formatSignedPct(portfolio.dailyProfitPct)}</span>
                        {portfolio.allFundsDailyUpdated ? (
                          <span className="ml-1 text-[10px] text-muted-foreground">已更新</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono">{portfolio.fundCount}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button type="button" variant="danger" size="sm" onClick={() => onDelete(portfolio)} disabled={isBusy}>
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 md:hidden">
              {portfolios.map((portfolio) => {
                const isEditing = editingPortfolioId === portfolio.id;
                return (
                  <Card key={portfolio.id}>
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        {!isEditing ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="text-left text-sm font-medium text-primary hover:underline"
                              onClick={() => onOpen(portfolio)}
                            >
                              {portfolio.name}
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`编辑组合名称 ${portfolio.name}`}
                              onClick={() => onStartRename(portfolio)}
                              disabled={isBusy}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Input
                            className="h-9 text-sm"
                            autoFocus
                            value={editingPortfolioName}
                            onChange={(event) => onRenameInputChange(event.target.value)}
                            onBlur={() => void onCommitRename(portfolio)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                (event.currentTarget as HTMLInputElement).blur();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                onCancelRename();
                              }
                            }}
                            disabled={isBusy}
                            maxLength={32}
                            aria-label={`编辑组合名称 ${portfolio.name}`}
                          />
                        )}
                        <Badge variant="secondary">{portfolio.type === "FREE" ? "自由" : "按比例"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">总金额: ¥{formatCurrency(portfolio.totalAmount)}</p>
                      <p className="text-xs text-muted-foreground">总收益: {compactProfitDisplay(portfolio.totalProfitDisplay)}</p>
                      <p className="text-xs text-muted-foreground">
                        当日收益: {formatSignedPct(portfolio.dailyProfitPct)}
                        {portfolio.allFundsDailyUpdated ? <span className="ml-1 text-[10px]">已更新</span> : null}
                      </p>
                      <div>
                        <Button type="button" variant="danger" size="sm" onClick={() => onDelete(portfolio)} disabled={isBusy}>
                          删除
                        </Button>
                      </div>
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

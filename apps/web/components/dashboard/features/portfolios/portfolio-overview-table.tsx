"use client";

import { PortfolioSummary } from "@digmo/shared";
import { 
  Pencil, 
  RefreshCw, 
  MoreVertical, 
  ExternalLink, 
  Trash2,
  TrendingUp,
  TrendingDown,
  ChevronRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">基金组合</h2>
          <p className="text-muted-foreground">管理您的投资组合资产配比与收益</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void onRefresh()} disabled={isBusy}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isBusy && "animate-spin")} />
          刷新数据
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-[200px]">
              <CardHeader>
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full mb-4" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : portfolios.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <div className="rounded-full bg-muted p-3 mb-4">
            <TrendingUp className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">暂无组合</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            您还没有创建任何基金组合。开始创建一个以跟踪您的投资。
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((portfolio) => (
            <PortfolioCard
              key={portfolio.id}
              portfolio={portfolio}
              isEditing={editingPortfolioId === portfolio.id}
              editingName={editingPortfolioName}
              isBusy={isBusy}
              onOpen={() => onOpen(portfolio)}
              onDelete={() => onDelete(portfolio)}
              onStartRename={() => onStartRename(portfolio)}
              onRenameInputChange={onRenameInputChange}
              onCommitRename={() => onCommitRename(portfolio)}
              onCancelRename={onCancelRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PortfolioCard({
  portfolio,
  isEditing,
  editingName,
  isBusy,
  onOpen,
  onDelete,
  onStartRename,
  onRenameInputChange,
  onCommitRename,
  onCancelRename
}: {
  portfolio: PortfolioSummary;
  isEditing: boolean;
  editingName: string;
  isBusy: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onStartRename: () => void;
  onRenameInputChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}) {
  const isProfit = portfolio.dailyProfitPct > 0;
  const isLoss = portfolio.dailyProfitPct < 0;

  return (
    <Card className="group relative flex flex-col overflow-hidden transition-all hover:shadow-md hover:border-primary/20">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1 pr-8">
          {isEditing ? (
            <Input
              autoFocus
              value={editingName}
              onChange={(e) => onRenameInputChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitRename();
                if (e.key === "Escape") onCancelRename();
              }}
              className="h-7 text-base font-semibold"
            />
          ) : (
            <CardTitle 
              className="text-lg font-bold leading-tight cursor-pointer hover:text-primary transition-colors"
              onClick={onOpen}
            >
              {portfolio.name}
            </CardTitle>
          )}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
              {portfolio.type === "FREE" ? "自由" : "按比例"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {portfolio.fundCount} 只基金
            </span>
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 absolute right-2 top-4">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>
              <ExternalLink className="mr-2 h-4 w-4" /> 查看详情
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onStartRename}>
              <Pencil className="mr-2 h-4 w-4" /> 重命名
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> 删除组合
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      
      <CardContent className="flex-1 pt-2">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">总资产</span>
          <span className="text-2xl font-bold font-mono">
            ¥{formatCurrency(portfolio.totalAmount)}
          </span>
        </div>
        
        <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/30 p-2">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase">当日收益</span>
            <div className={cn(
              "flex items-center font-mono font-semibold",
              isProfit ? "text-red-600 dark:text-red-400" : isLoss ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
            )}>
              {isProfit && <TrendingUp className="mr-1 h-3 w-3" />}
              {isLoss && <TrendingDown className="mr-1 h-3 w-3" />}
              {formatSignedPct(portfolio.dailyProfitPct)}
            </div>
          </div>
          {portfolio.allFundsDailyUpdated && (
            <Badge variant="secondary" className="h-5 bg-background text-[9px] px-1 text-muted-foreground border border-muted-foreground/20">
              已更新
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

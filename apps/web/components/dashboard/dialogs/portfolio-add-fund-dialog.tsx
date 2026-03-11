"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PortfolioSummary } from "@digmo/shared";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const portfolioAddFundDialogSchema = z.object({
  fundCode: z.string().regex(/^\d{6}$/, "请输入 6 位基金代码"),
  holdingAmount: z.string().min(1, "请输入持仓金额"),
  holdingProfitAmount: z.string().optional(),
  plannedRatio: z.string().optional(),
});

export type PortfolioAddFundFormValues = z.infer<typeof portfolioAddFundDialogSchema>;

interface PortfolioAddFundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PortfolioAddFundFormValues) => Promise<void>;
  targetPortfolio: PortfolioSummary | null;
  isBusy?: boolean;
}

export function PortfolioAddFundDialog({
  open,
  onOpenChange,
  onSubmit,
  targetPortfolio,
  isBusy,
}: PortfolioAddFundDialogProps) {
  const form = useForm<PortfolioAddFundFormValues>({
    resolver: zodResolver(portfolioAddFundDialogSchema),
    defaultValues: {
      fundCode: "",
      holdingAmount: "",
      holdingProfitAmount: "",
      plannedRatio: "",
    },
  });

  async function handleSubmit(values: PortfolioAddFundFormValues) {
    await onSubmit(values);
    form.reset({
      fundCode: "",
      holdingAmount: "",
      holdingProfitAmount: "",
      plannedRatio: "",
    });
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        onOpenChange(val);
        if (!val) {
          form.reset({
            fundCode: "",
            holdingAmount: "",
            holdingProfitAmount: "",
            plannedRatio: "",
          });
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加基金到当前组合</DialogTitle>
          <DialogDescription>
            {targetPortfolio ? `目标组合：${targetPortfolio.name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
            <FormField
              control={form.control}
              name="fundCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>基金代码</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" placeholder="000000" disabled={isBusy} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="holdingAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>持仓金额</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="例如：5000" disabled={isBusy} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="holdingProfitAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>持有收益金额（可正可负）</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="例如：-88.36（不填默认为 0）"
                      disabled={isBusy}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {targetPortfolio?.type === "RATIO" ? (
              <FormField
                control={form.control}
                name="plannedRatio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>计划比例(%)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="例如：25" disabled={isBusy} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isBusy || isSubmitting} aria-busy={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    添加中...
                  </>
                ) : (
                  "确认添加"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

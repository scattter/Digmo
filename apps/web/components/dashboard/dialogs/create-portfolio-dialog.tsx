"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PortfolioType } from "@digmo/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const createPortfolioDialogSchema = z.object({
  name: z.string().min(1, "请输入组合名称").max(32, "组合名称长度不能超过 32"),
  type: z.enum(["FREE", "RATIO"]),
});

export type CreatePortfolioFormValues = z.infer<typeof createPortfolioDialogSchema>;

interface CreatePortfolioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreatePortfolioFormValues) => Promise<void>;
  isBusy?: boolean;
}

export function CreatePortfolioDialog({
  open,
  onOpenChange,
  onSubmit,
  isBusy,
}: CreatePortfolioDialogProps) {
  const form = useForm<CreatePortfolioFormValues>({
    resolver: zodResolver(createPortfolioDialogSchema),
    defaultValues: {
      name: "",
      type: "FREE",
    },
  });

  async function handleSubmit(values: CreatePortfolioFormValues) {
    await onSubmit(values);
    form.reset({ name: "", type: "FREE" });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        onOpenChange(val);
        if (!val) {
          form.reset({ name: "", type: "FREE" });
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建组合</DialogTitle>
          <DialogDescription>填写组合名称并选择类型。</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>组合名称</FormLabel>
                  <FormControl>
                    <Input placeholder="例如：稳健组合" disabled={isBusy} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>组合类型</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isBusy}>
                      <SelectTrigger>
                        <SelectValue placeholder="请选择组合类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FREE">自由组合</SelectItem>
                        <SelectItem value="RATIO">按比例组合</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isBusy}>
                确认创建
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { Clock3 } from "lucide-react";

interface StatusFeedbackProps {
  lastManualRefreshAt: string;
}

export function StatusFeedback({ lastManualRefreshAt }: StatusFeedbackProps) {
  return (
    <section aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock3 className="h-4 w-4" />
        {lastManualRefreshAt ? `最近手动更新: ${lastManualRefreshAt}` : "当前为手动更新模式，不会自动刷新。"}
      </p>
    </section>
  );
}

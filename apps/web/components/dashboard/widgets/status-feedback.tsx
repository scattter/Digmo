import { Clock3 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface StatusFeedbackProps {
  lastManualRefreshAt: string;
}

export function StatusFeedback({ lastManualRefreshAt }: StatusFeedbackProps) {
  return (
    <section aria-live="polite">
      <Alert>
        <Clock3 className="h-4 w-4" />
        <AlertTitle>手动更新模式</AlertTitle>
        <AlertDescription>
          {lastManualRefreshAt
            ? `最近手动更新: ${lastManualRefreshAt}`
            : "当前为手动更新模式，不会自动刷新。"}
        </AlertDescription>
      </Alert>
    </section>
  );
}

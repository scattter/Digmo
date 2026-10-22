import { ClockCircleOutlined } from "@ant-design/icons";
import { Alert } from "antd";

interface StatusFeedbackProps {
  lastManualRefreshAt: string;
}

export function StatusFeedback({ lastManualRefreshAt }: StatusFeedbackProps) {
  return (
    <section aria-live="polite">
      <Alert
        message="手动更新模式"
        description={
          lastManualRefreshAt
            ? `最近手动更新: ${lastManualRefreshAt}`
            : "当前为手动更新模式，不会自动刷新。"
        }
        type="info"
        showIcon
        icon={<ClockCircleOutlined />}
      />
    </section>
  );
}

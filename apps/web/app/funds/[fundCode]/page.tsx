import Link from "next/link";
import { LeftOutlined } from "@ant-design/icons";
import { FundDisclaimerPanel } from "@/components/fund-detail/fund-disclaimer-panel";
import { FundHoldingsTable } from "@/components/fund-detail/fund-holdings-table";
import { FundKpiCards } from "@/components/fund-detail/fund-kpi-cards";
import { FundMethodConfidence } from "@/components/fund-detail/fund-method-confidence";
import { Button, Typography } from "antd";
import { fetchSingleEstimate } from "@/lib/api";

const { Title, Text } = Typography;

export default async function FundPage({ params }: { params: Promise<{ fundCode: string }> }) {
  const { fundCode } = await params;
  const snapshot = await fetchSingleEstimate(fundCode);

  return (
    <main id="main-content" className="mx-auto w-full max-w-7xl px-4 pb-14 pt-6 md:px-6">
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Title level={2} style={{ marginBottom: 0 }}>{snapshot.fundName ?? `基金 ${snapshot.fundCode}`}</Title>
          <Text type="secondary">盘中估值详情</Text>
        </div>
        <Link href="/">
          <Button icon={<LeftOutlined />}>
            返回列表
          </Button>
        </Link>
      </section>

      <div className="space-y-4">
        <FundKpiCards snapshot={snapshot} />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <FundHoldingsTable snapshot={snapshot} />
          </div>
          <FundMethodConfidence snapshot={snapshot} />
        </div>

        <FundDisclaimerPanel snapshot={snapshot} />
      </div>
    </main>
  );
}

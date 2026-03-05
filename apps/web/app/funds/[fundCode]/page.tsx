import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { FundDisclaimerPanel } from "@/components/fund-detail/fund-disclaimer-panel";
import { FundHoldingsTable } from "@/components/fund-detail/fund-holdings-table";
import { FundKpiCards } from "@/components/fund-detail/fund-kpi-cards";
import { FundMethodConfidence } from "@/components/fund-detail/fund-method-confidence";
import { Button } from "@/components/ui/button";
import { fetchSingleEstimate } from "@/lib/api";

export default async function FundPage({ params }: { params: Promise<{ fundCode: string }> }) {
  const { fundCode } = await params;
  const snapshot = await fetchSingleEstimate(fundCode);

  return (
    <main id="main-content" className="mx-auto w-full max-w-7xl px-4 pb-14 pt-6 md:px-6">
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{snapshot.fundName ?? `基金 ${snapshot.fundCode}`}</h1>
          <p className="mt-1 text-sm text-muted-foreground">盘中估值详情</p>
        </div>
        <Button variant="secondary" asChild>
          <Link href="/">
            <ChevronLeft className="h-4 w-4" />
            返回列表
          </Link>
        </Button>
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

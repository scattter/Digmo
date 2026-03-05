import { BatchEstimateResponse, FundEstimateSnapshot } from "@digmo/shared";
import { Text, View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { useEffect, useState } from "react";

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL ?? "http://localhost:3001";
const DEFAULT_CODES = ["161725", "110011", "006327"];

function formatMarketCap(value?: number): string {
  if (typeof value !== "number") {
    return "-";
  }
  return `${(value / 100000000).toFixed(2)}亿`;
}

export default function IndexPage() {
  const [items, setItems] = useState<FundEstimateSnapshot[]>([]);
  const [error, setError] = useState<string>("");

  const loadData = async (): Promise<void> => {
    try {
      setError("");
      const response = await Taro.request<BatchEstimateResponse>({
        url: `${API_BASE_URL}/v1/funds/estimate/batch`,
        method: "POST",
        data: {
          fundCodes: DEFAULT_CODES
        }
      });

      setItems(response.data.data ?? []);
    } catch {
      setError("请求失败，请稍后重试");
    } finally {
      Taro.stopPullDownRefresh();
    }
  };

  usePullDownRefresh(() => {
    void loadData();
  });

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <View style={{ padding: "20px", background: "#f6f7f3", minHeight: "100vh" }}>
      <View style={{ marginBottom: "16px" }}>
        <Text style={{ fontSize: "22px", fontWeight: "bold" }}>Digmo 盘中估值</Text>
      </View>

      {error ? <Text style={{ color: "#9a1f1f" }}>{error}</Text> : null}

      {items.map((item) => (
        <View
          key={item.fundCode}
          style={{
            background: "#fff",
            border: "1px solid #d6dad9",
            borderRadius: "12px",
            padding: "12px",
            marginBottom: "10px"
          }}
        >
          <Text style={{ display: "block", fontWeight: "bold" }}>{item.fundName}</Text>
          <Text style={{ display: "block", marginTop: "4px" }}>基金代码: {item.fundCode}</Text>
          <Text style={{ display: "block", marginTop: "4px" }}>官方最新净值: {item.officialNav.toFixed(4)}</Text>
          <Text style={{ display: "block", marginTop: "4px" }}>官方日涨跌: {(item.officialDailyReturn * 100).toFixed(2)}%</Text>
          <Text style={{ display: "block", marginTop: "4px" }}>盘中估值: {item.estimateNav.toFixed(4)}</Text>
          <Text style={{ display: "block", marginTop: "4px" }}>当日涨幅: {(item.estimateChangePct * 100).toFixed(2)}%</Text>
          <Text style={{ display: "block", marginTop: "4px" }}>
            前五持仓:{" "}
            {item.topHoldings.length > 0
              ? item.topHoldings
                  .map((holding) => {
                    const quotePart =
                      typeof holding.latestPrice === "number"
                        ? `, 价${holding.latestPrice.toFixed(2)}, 涨跌${((holding.changePct ?? 0) * 100).toFixed(2)}%`
                        : "";
                    const marketPart =
                      holding.marketCap || holding.floatMarketCap
                        ? `, 总市值${formatMarketCap(holding.marketCap)}, 流通${formatMarketCap(holding.floatMarketCap)}`
                        : "";
                    return `${holding.name}(${(holding.ratio * 100).toFixed(2)}%${quotePart}${marketPart})`;
                  })
                  .join(" / ")
              : "暂无"}
          </Text>
          <Text style={{ display: "block", marginTop: "4px" }}>置信度: {item.confidenceLevel}</Text>
          <Text style={{ display: "block", marginTop: "4px", color: "#5f6967" }}>{item.disclaimer}</Text>
        </View>
      ))}
    </View>
  );
}

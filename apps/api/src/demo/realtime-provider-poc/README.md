# Realtime Provider PoC Demo

目的：在不改现有业务链路的前提下，验证“替换实时数据接口”的可行性，输出延迟、稳定性、准确性代理指标与切换建议。

## 目录结构

- `run.ts`: 一键执行探测与评估
- `reports/`: 运行后生成 JSON 报告

## 测试内容

- 基金估值链路
- `fundgz_direct`: 直接调用 `fundgz.1234567.com.cn`
- `digmo_api`: 调当前 Digmo API `/v1/funds/:fundCode/estimate`
- 输出 `digmo_api` vs `fundgz_direct` 的涨跌幅差值（bps）

- 股票实时价格链路（可选，按 API Key 自动启用）
- `alpaca`
- `twelvedata`
- `alphavantage`
- 输出成功率、延迟、相对“当轮中位价”的偏差（drift bps）

## 运行方式

在仓库根目录执行：

```bash
pnpm --filter @digmo/api demo:realtime-provider-poc
```

## 环境变量

可选参数：

```bash
DEMO_ROUNDS=6
DEMO_INTERVAL_MS=1500
DEMO_TIMEOUT_MS=4500
DEMO_FUND_CODES=020273,161725
DEMO_STOCK_SYMBOLS=AAPL,MSFT
DEMO_APP_API_BASE_URL=http://localhost:3001
```

股票接口 Key（不填则对应 provider 自动跳过）：

```bash
ALPACA_API_KEY=...
ALPACA_API_SECRET=...
TWELVEDATA_API_KEY=...
ALPHAVANTAGE_API_KEY=...
```

## 判定门槛（可按业务再收紧）

- 成功率 `>= 95%`
- P95 延迟 `<= 1200ms`
- 股票均值偏差 `<= 30bps`
- 基金 `digmo_api` 相对 `fundgz_direct`：
- 均值差 `<= 15bps`
- 最大差 `<= 40bps`

## 切换建议流程

1. 先用你真实基金池和股票池跑 3-5 次（覆盖交易时段）。
2. 对候选 provider 看 `successRate/p95/drift` 是否稳定达标。
3. 达标后再进入主链路灰度（`hybrid primary + fallback`）。
4. 灰度期内继续采集同样指标，确认后再全量切换。

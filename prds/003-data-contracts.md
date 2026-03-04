# Digmo 数据契约

## API

1. `GET /v1/funds/:fundCode/estimate`
2. `POST /v1/funds/estimate/batch`
3. `GET /v1/funds/flat?expand=dedup|expanded&sortOrder=default|desc|asc`
4. `GET /v1/portfolios`
5. `POST /v1/portfolios`
6. `PATCH /v1/portfolios/:portfolioId`
7. `DELETE /v1/portfolios/:portfolioId`
8. `GET /v1/portfolios/:portfolioId/funds`
9. `POST /v1/portfolios/:portfolioId/funds`
10. `PATCH /v1/portfolios/:portfolioId/funds/:fundCode`
11. `DELETE /v1/portfolios/:portfolioId/funds/:fundCode`
12. `PATCH /v1/portfolios/:portfolioId/funds/order`
13. `GET /v1/tasks/valuation/status`
14. `GET /v1/health`

## 估值响应字段（FundEstimateSnapshot）

- `fundCode: string`
- `fundName: string`
- `officialNav: number`
- `officialDailyReturn: number`
- `estimateNav: number`
- `estimateChangePct: number`
- `baseNavDate: string` (`YYYY-MM-DD`)
- `estimateTime: string` (ISO8601)
- `confidenceLevel: HIGH | MEDIUM | LOW`
- `confidenceScore: number` (`0-100`)
- `method: INDEX_TRACKING | BETA_PROXY`
- `inputsStalenessSec: number`
- `holdingReportDate?: string`
- `topHoldings: { code: string; name: string; ratio: number; latestPrice?: number; changePct?: number; marketCap?: number; floatMarketCap?: number; source?: string }[]`
- `disclaimer: string`

## 组合与平铺 DTO

### PortfolioType

- `FREE | RATIO`

### PortfolioSummary

- `id: string`
- `name: string`
- `type: PortfolioType`
- `fundCount: number`
- `totalAmount: number`
- `totalProfitAmount: number`
- `totalProfitPct: number`
- `totalProfitDisplay: string`（金额/比例）
- `intradayEstimatePct: number`

### PortfolioFundItem

- `portfolioId: string`
- `portfolioName: string`
- `portfolioType: PortfolioType`
- `fundCode: string`
- `displayOrder: number`（组合内手动顺序）
- `fundName?: string`
- `holdingAmount: number`
- `estimateChangePct?: number`
- `totalChangePct: number`
- `intradayAmount?: number`
- `totalProfitAmount: number`
- `trend: UP | DOWN | FLAT`
- `plannedRatio?: number`（仅 RATIO）
- `actualRatio?: number`（仅 RATIO）

### FlatFundItem

- `fundCode: string`
- `fundName?: string`
- `holdingAmount: number`
- `estimateChangePct?: number`
- `totalChangePct: number`
- `trend: UP | DOWN | FLAT`
- `portfolioCount: number`
- `portfolioNames: string[]`
- `portfolioId?: string`（expanded 模式）
- `portfolioName?: string`（expanded 模式）
- `portfolioType?: PortfolioType`（expanded 模式）
- `plannedRatio?: number`（expanded + RATIO）
- `actualRatio?: number`（expanded + RATIO）

## 错误码

- `FUND_NOT_FOUND`
- `ESTIMATE_NOT_READY`
- `INVALID_FUND_CODES`
- `INVALID_PORTFOLIO`
- `PORTFOLIO_NOT_FOUND`
- `PORTFOLIO_FUND_NOT_FOUND`
- `DUPLICATE_PORTFOLIO_NAME`
- `DATA_SOURCE_UNAVAILABLE`
- `INTERNAL_ERROR`

## 约束

1. `fundCode` 仅允许数字字符串，长度 6。
2. 批量估值请求数量上限 50。
3. `plannedRatio` 范围为 `[0, 1]`，且单组合计划比例总和 `<= 1`。
4. `GET /v1/funds/flat` 的 `sortOrder` 支持：`default | desc | asc`。
5. `PATCH /v1/portfolios/:portfolioId/funds/order` 要求 `fundCodes` 为完整且唯一集合：
   - 数量与组合当前基金数一致
   - 集合完全一致（不可缺失/新增/重复/跨组合）
6. 盘中估算涨跌口径：
   - 交易日：优先使用当日实时估值；若接口不可用或非当日数据，返回 `0`
   - 非交易日：返回 `0`

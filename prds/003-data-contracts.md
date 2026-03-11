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
15. `PUT /v1/portfolios/:portfolioId/decision-doc`
16. `GET /v1/portfolios/:portfolioId/decision-doc`
17. `POST /v1/portfolios/:portfolioId/daily-decision:generate`
18. `GET /v1/portfolios/:portfolioId/daily-decision/latest`
19. `GET /v1/portfolios/:portfolioId/daily-decision/history`
20. `POST /v1/portfolios/:portfolioId/funds/:fundCode/position-operations`
21. `GET /v1/portfolios/:portfolioId/position-operations?limit=<n>&fundCode=<code>`

## 下线接口

- `GET /v2/portfolios/daily-profit`（已移除，返回 `404`）

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
- `dailyProfitPct: number`
- `allFundsDailyUpdated: boolean`
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
- `holdingProfitAmount: number`
- `holdingProfitPct: number`
- `dailyProfitAmount?: number`
- `dailyProfitPct?: number`
- `dailyProfitOfficialUpdated: boolean`
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

## 决策建议 DTO

### DecisionDocFormat

- `TEXT | MARKDOWN`

### DecisionActionType

- `BUY | SELL | HOLD | REBALANCE`

### DecisionRiskLevel

- `LOW | MEDIUM | HIGH`

### DecisionCitation

- `title: string`
- `url?: string`
- `snippet: string`
- `sourceType: portfolio_doc | market_context | world_context | portfolio_data | other`

### PortfolioDecisionDoc

- `id: string`
- `portfolioId: string`
- `version: number`
- `title?: string`
- `format: DecisionDocFormat`
- `content: string`
- `sourceFileName?: string`
- `createdAt: string` (ISO8601)
- `updatedAt: string` (ISO8601)

### DailyDecisionAction

- `actionType: DecisionActionType`
- `fundCode: string`
- `fundName?: string`
- `rationale: string`
- `targetPositionPct?: number`
- `targetAmount?: number`
- `triggerCondition: string`
- `validUntil: string` (ISO8601)
- `confidence: number` (`0-1`)
- `riskLevel: DecisionRiskLevel`
- `requiresSecondConfirm: boolean`
- `citations: DecisionCitation[]`（必填，至少 1 条）

### DailyDecision

- `id: string`
- `portfolioId: string`
- `tradeDate: string` (`YYYY-MM-DD`)
- `summary: string`
- `overallRiskLevel: DecisionRiskLevel`
- `actions: DailyDecisionAction[]`
- `provider: string`
- `model: string`
- `status: SUCCESS | FAILED`
- `errorMessage?: string`
- `latencyMs: number`
- `usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }`
- `createdAt: string` (ISO8601)

## 仓位操作 DTO

### PositionOperationType

- `INCREASE | DECREASE`

### PositionOperationBindSuggestion

- `decisionId: string`
- `actionOrder: number`
- `actionType: DecisionActionType`
- `fundCode: string`
- `fundName?: string`
- `riskLevel: DecisionRiskLevel`
- `rationale: string`

### PositionOperationRecord

- `id: string`
- `portfolioId: string`
- `fundCode: string`
- `operationType: PositionOperationType`
- `amount: number`
- `beforeHoldingAmount: number`
- `afterHoldingAmount: number`
- `beforeHoldingProfitAmount: number`
- `afterHoldingProfitAmount: number`
- `bindSuggestion?: PositionOperationBindSuggestion`
- `createdAt: string` (ISO8601)

## 错误码

- `FUND_NOT_FOUND`
- `ESTIMATE_NOT_READY`
- `INVALID_FUND_CODES`
- `INVALID_PORTFOLIO`
- `PORTFOLIO_NOT_FOUND`
- `PORTFOLIO_FUND_NOT_FOUND`
- `DUPLICATE_PORTFOLIO_NAME`
- `DECISION_DOC_NOT_FOUND`
- `DECISION_GENERATION_FAILED`
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
7. 每条 `DailyDecisionAction` 必须附带至少 1 条 `citations`。
8. `DailyDecisionAction.fundCode` 必须属于当前组合内基金。
9. 若 `riskLevel=HIGH`，则 `requiresSecondConfirm=true`。
10. 仓位操作 `amount` 必须大于 `0`；减仓金额不可超过当前持仓金额。
11. `GET /v1/portfolios/:portfolioId/position-operations` 的 `limit` 取值范围为 `1-200`（默认 `50`）。
12. `bindSuggestion`（若传）必须绑定“当前组合当日最新建议”，且 `actionOrder` 必须命中该建议的动作序号。

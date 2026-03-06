# 007 V2 当日收益 Hybrid 对比改造 PRD

## 1. 背景
当前页面收益口径仅走 `v1`，无法在同一页面持续观察新旧算法差异；同时 `v2` 需要引入更快的新数据源并具备降级能力，避免单一上游波动影响可用性。

## 2. 目标
1. 保持 `v1` 现有口径不变。
2. 新增 `v2` 组合当日收益接口，采用 `Twelve Data + FundGZ fallback` 的 hybrid 方案。
3. 页面支持展示 `v1/v2` 差异，便于交易日对比验证。
4. 对比区域仅在“全部组合”页面显示，避免单组合页噪音。

## 3. 范围
### 3.1 后端
- `apps/api/src/routes/watchlist.ts`
- `apps/api/src/config.ts`
- `apps/api/src/app.ts`
- `apps/api/src/routes/__tests__/watchlist-routes.test.ts`
- `apps/api/.env.example`

### 3.2 前端
- `apps/web/lib/api.ts`
- `apps/web/hooks/use-dashboard-data.ts`
- `apps/web/app/fund-dashboard.tsx`
- `apps/web/components/dashboard/daily-profit-compare-panel.tsx`

### 3.3 共享类型
- `packages/shared/src/types.ts`

## 4. 数据与接口设计
### 4.1 新增接口
- `GET /v2/portfolios/daily-profit`

返回结构：
1. `tradeDate`
2. `generatedAt`
3. `source = TWELVE_DATA_FUNDGZ_HYBRID`
4. `portfolios[]`（组合级 `dailyProfitPct/dailyProfitAmount`，含可用/缺失基金数量）

### 4.2 计算逻辑
1. `v2` 逐基金优先请求 Twelve Data。
2. Twelve Data 无有效结果时回退 FundGZ。
3. 组合收益按可用基金的 `holdingAmount * estimateChangePct` 聚合，计算金额与加权比例。

## 5. 前端展示规则
1. 当 `mainView=portfolios` 且 `selectedPortfolioId=all` 时展示“当日收益对比（V1 vs V2）”。
2. 展示字段：
   - `V1 当日收益（% / 金额）`
   - `V2 当日收益（% / 金额）`
   - `差值(%)`
   - `差值(¥)`
   - `V2 缺失基金数`
3. 单个组合详情页不展示该对比面板。

## 6. 配置与安全
1. 新增环境变量：
   - `TWELVEDATA_API_KEY`
   - `TWELVEDATA_BASE_URL`
   - `TWELVEDATA_TIMEOUT_MS`
2. 本地密钥放 `apps/api/.env`，并纳入 `.gitignore` 防止泄露。

## 7. 验证
1. `@digmo/api` 路由测试通过，覆盖 `v2` 返回结构。
2. `@digmo/web` 类型检查通过。
3. 本地调用 `/v2/portfolios/daily-profit` 返回 `source=TWELVE_DATA_FUNDGZ_HYBRID`。

## 8. 验收标准
1. `v1` 与 `v2` 可并行读取且互不影响。
2. “全部组合”页可直观看到 `v1/v2` 差异。
3. Twelve Data 不可用时 `v2` 自动降级到 FundGZ，接口仍可返回结果。

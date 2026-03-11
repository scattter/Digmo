# 007 V2 当日收益 Hybrid 对比改造 PRD（已归档）

> 状态：已下线（2026-03-10）

## 1. 归档说明

本 PRD 对应的 `v2` 当日收益对比能力已从当前主线代码移除，保留本文档仅用于历史追溯与变更审计，不再作为在线能力规范。

## 2. 已移除内容

1. 后端接口
   - `GET /v2/portfolios/daily-profit` 已删除。
2. 前端能力
   - “全部组合”页中的 `V1 vs V2` 对比面板已删除。
   - 相关拉取逻辑与状态管理已删除（`fetchPortfoliosDailyProfitV2`、`portfolioDailyProfitV2*`）。
3. 共享类型
   - `PortfolioDailyProfitV2Item`
   - `PortfolioDailyProfitV2Response`
4. 配置项
   - `TWELVEDATA_API_KEY`
   - `TWELVEDATA_BASE_URL`
   - `TWELVEDATA_TIMEOUT_MS`

## 3. 当前替代现状

1. 组合当日收益口径统一走 `v1`（`PortfolioSummary.dailyProfitPct`）。
2. `analysis` 视图保留导航入口，当前仅展示“V2 视图已下线，暂无可展示分析内容”的占位说明。

## 4. 回归验证基线

1. `@digmo/api` 路由测试中，访问 `/v2/portfolios/daily-profit` 预期返回 `404`。
2. `@digmo/web` 不再请求 v2 接口，页面不存在 v1/v2 对比 UI。

## 5. 后续建议

若未来恢复“多口径收益对比”，建议使用新编号 PRD，避免复用本归档文档造成语义混淆。

# @digmo/api

Fastify API + 估值任务模块。

## API

- `GET /v1/funds/:fundCode/estimate`
- `POST /v1/funds/estimate/batch`
- `GET /v1/funds/flat?expand=dedup|expanded&sortOrder=desc|asc`
- `GET /v1/portfolios`
- `POST /v1/portfolios`
- `PATCH /v1/portfolios/:portfolioId`
- `DELETE /v1/portfolios/:portfolioId`
- `GET /v1/portfolios/:portfolioId/funds`
- `POST /v1/portfolios/:portfolioId/funds`
- `PATCH /v1/portfolios/:portfolioId/funds/:fundCode`
- `DELETE /v1/portfolios/:portfolioId/funds/:fundCode`
- `GET /v1/tasks/valuation/status`
- `GET /v1/health`

## 运行

```bash
pnpm --filter @digmo/api dev
```

## 说明

- 当前默认内存存储与内存缓存，便于本地 MVP 验证。
- 组合与组合基金关系会持久化到 SQLite（默认路径 `apps/api/data/watchlist.sqlite`，可通过 `WATCHLIST_DB_PATH` 覆盖）。
- 首次升级时若检测到旧 `user_watchlist_fund` 表存在数据，会自动迁移到 `默认组合`（幂等）。
- `db/schema.sql` 提供 PostgreSQL 目标表结构。
- 数据源提供器默认是 MCP 形态的 Seed Provider，可替换为真实 MCP/商业数据源。
- 默认启用脚本同款行情与估值逻辑：A 股实时涨跌优先新浪行情，港股/ETF 走东财接口兜底，并按持仓权重估算当日涨跌；前五持仓会补充 `latestPrice/changePct/marketCap/floatMarketCap`。东财相关参数仍可通过 `EASTMONEY_*` 环境变量调整。

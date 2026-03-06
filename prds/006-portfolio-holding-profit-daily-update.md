# 006 基金组合持有收益与当日更新改造 PRD

## 1. 背景
基金组合页面原有口径以“历史总涨跌/盘中估算”为主，且基金持仓与收益缺乏基于官方交易日数据的自动滚动。随着组合管理需求提升，需要统一收益口径、补齐更新状态可视化，并优化基金列表编辑与展示交互。

## 2. 目标
1. 将组合基金收益主口径统一为“持有收益（金额/百分比）”。
2. 基于官方净值更新实现基金持仓与持有收益的按交易日幂等滚动。
3. 将基金编辑入口统一为“操作列更新弹窗”，支持维护持仓、计划比例、持有收益（允许负值）。
4. 完成基金列表结构改造：固定列、列宽、两行基金名、当日收益状态标识、移动端卡片适配。
5. 全部组合页将“当日预估”改为“当日收益”，并支持组合级“已更新”状态。
6. 比例达成区域支持展开/收起。

## 3. 范围
### 3.1 后端
- `apps/api/src/routes/watchlist.ts`
- `apps/api/src/infra/watchlist/sqlite-watchlist-store.ts`
- `apps/api/src/routes/__tests__/watchlist-routes.test.ts`
- `apps/api/data/watchlist.sqlite`（本地 DB 结构更新）

### 3.2 前端
- `apps/web/components/dashboard/portfolio-funds-table.tsx`
- `apps/web/components/dashboard/portfolio-overview-table.tsx`
- `apps/web/components/dashboard/ratio-analysis-panel.tsx`
- `apps/web/components/dashboard/dashboard-shell.tsx`
- `apps/web/app/fund-dashboard.tsx`
- `apps/web/hooks/use-dashboard-data.ts`
- `apps/web/hooks/use-portfolio-actions.ts`
- `apps/web/lib/api.ts`
- `apps/web/lib/format.ts`

### 3.3 共享类型
- `packages/shared/src/types.ts`

## 4. 数据与接口改造
### 4.1 数据模型
`user_portfolio_fund` 新增字段：
1. `holding_profit_amount REAL NOT NULL DEFAULT 0`
2. `last_holding_roll_nav_date TEXT`

### 4.2 共享类型扩展
`PortfolioFundItem` 新增：
1. `holdingProfitAmount`
2. `holdingProfitPct`
3. `dailyProfitAmount`
4. `dailyProfitPct`
5. `dailyProfitOfficialUpdated`

`PortfolioSummary` 新增：
1. `dailyProfitPct`
2. `allFundsDailyUpdated`

### 4.3 API 请求字段
`POST/PATCH /v1/portfolios/:portfolioId/funds...`：
1. 新增 `holdingProfitAmount`
2. `PATCH` 至少需包含 `holdingAmount | plannedRatio | holdingProfitAmount` 之一
3. `holdingProfitAmount` 允许负值，非法数字返回 `400`

## 5. 后端业务规则
### 5.1 官方数据驱动滚动
在组合相关读取接口中执行基金状态同步；当识别到基金官方净值日有新值时，按基金维度执行一次滚动：
1. `dayProfit = round(prevHoldingAmount * officialDailyReturn, 2)`
2. `newHoldingAmount = round(prevHoldingAmount + dayProfit, 2)`
3. `newHoldingProfitAmount = round(prevHoldingProfitAmount + dayProfit, 2)`
4. 记录 `last_holding_roll_nav_date = navDate`，同一 `navDate` 不重复滚动

### 5.2 当日收益口径
1. 若基金识别为“交易日当天官方数据已累计”：`dailyProfitPct = officialDailyReturn`
2. 否则：`dailyProfitPct = estimateChangePct`
3. `dailyProfitAmount = round(holdingAmount * dailyProfitPct, 2)`

### 5.3 持有收益百分比
1. 分母按成本口径：`cost = holdingAmount - holdingProfitAmount`
2. `holdingProfitPct = holdingProfitAmount / cost`
3. `cost <= 0` 时回落为 `0`

### 5.4 组合汇总
1. `totalProfitAmount` 改为基金 `holdingProfitAmount` 聚合
2. `totalProfitPct` 改为按成本口径计算
3. 新增 `dailyProfitPct`（按基金持仓加权）
4. 新增 `allFundsDailyUpdated`（组合内基金全部官方更新时为真）

## 6. 前端交互与视觉改造
### 6.1 基金列表列结构
桌面表格列：
1. 排序（固定列）
2. 基金（固定列，宽 150）
3. 持仓（宽 130）
4. 持有收益（宽 130）
5. 当日收益（宽 130）
6. 持有/计划（宽约 100）
7. 操作（固定列，宽 120）

### 6.2 收益与状态展示
1. 持有收益展示：`金额/百分比`
2. 当日收益展示：`金额/百分比`
3. 当基金当日收益使用官方口径时，在当日收益下方显示“已更新”小字

### 6.3 编辑交互
1. 移除持仓/计划内联编辑
2. 操作列提供“更新”弹窗
3. 弹窗字段：持仓金额、计划比例（RATIO 组合）、持有收益金额（可负）

### 6.4 表格体验
1. 保留固定列（排序/基金/操作）
2. 固定列使用不透明白色背景，避免横向滚动时透出后方文案
3. 表头使用默认 hover 背景同款底色常驻（非 hover 也显示）
4. 基金名两行截断，hover 展示完整名称
5. 移动端卡片中“持有/计划”指标左对齐

### 6.5 全部组合页
1. “当日预估”文案改为“当日收益”
2. 组合收益显示改用 `dailyProfitPct`
3. `allFundsDailyUpdated=true` 时显示组合级“已更新”标识

### 6.6 比例达成区域
1. 支持展开/收起
2. 默认收起

## 7. 测试与验证
已补充/更新 API 路由测试覆盖：
1. 官方净值首次更新触发滚动且同日幂等
2. 非官方更新回落估算口径
3. `holdingProfitAmount` 负值可更新，非法值返回 400
4. 组合级 `dailyProfitPct` 与 `allFundsDailyUpdated` 返回正确

## 8. 兼容性与风险
1. 保留 `intradayEstimatePct` 字段用于兼容旧消费方。
2. 当前读取接口仍包含同步逻辑，首屏冷启动可能存在性能压力（后续可拆分为异步任务或限流并发优化）。

## 9. 验收标准
1. 基金列表和全部组合页均完成“当日收益”替换。
2. 基金与组合均可展示“已更新”状态。
3. 更新弹窗支持持有收益编辑并生效。
4. 官方数据更新后，持仓/持有收益/组合汇总自动滚动。
5. 固定列滚动遮挡正确，不透底。
6. 比例达成区可展开/收起。

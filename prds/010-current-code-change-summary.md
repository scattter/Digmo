# 010 当前代码变更汇总（2026-03-12）

## 1. 变更范围概览
1. 后端：组合页签布局偏好持久化能力（SQLite + API + 测试）。
2. 前端：仪表盘主页面结构重构为顶部导航 + 可拖拽页签 + 三视图（账户汇总 / 全部基金 / 单组合详情）。
3. 组件与交互：新增多组 dashboard 视图与卡片组件，优化弹窗与列表移动端体验。
4. UI 与样式：补充滚动条隐藏样式、统一全局加载态视觉、修复空态居中展示。
5. 依赖升级适配：批量迁移 Ant Design v6 弃用 API（`Spin.tip`、`Card.bordered`、`Space.direction`、`List`）。

## 2. 后端改动（apps/api）
### 2.1 组合页签布局偏好
- 文件：`apps/api/src/infra/watchlist/sqlite-watchlist-store.ts`
- 新增 `PortfolioTabLayoutPreference` 类型与 `WatchlistStore` 接口能力：
  - `getPortfolioTabLayoutPreference(userId)`
  - `setPortfolioTabLayoutPreference(userId, preference)`
- 新增表：`user_portfolio_layout_preference`
  - 字段：`user_id`、`funds_tab_index`、`created_at`、`updated_at`
  - `funds_tab_index` 约束为非负整数。
- 新增读写实现，包含默认值兜底与入参归一化（`Math.max(0, Math.floor(...))`）。

### 2.2 路由与参数校验
- 文件：`apps/api/src/routes/watchlist.ts`
- 新增参数解析：`parseFundsTabIndex`（非负整数校验，不合法返回 400）。
- 新增接口：
  - `GET /v1/portfolios/tab-layout`
  - `PATCH /v1/portfolios/tab-layout`

### 2.3 测试与数据文件
- 文件：`apps/api/src/routes/__tests__/watchlist-routes.test.ts`
- 新增集成测试：
  - 默认值为 0；
  - PATCH 后可读回；
  - 重启后仍持久化；
  - 非法输入（如 `-1`）返回 400。
- 文件：`apps/api/data/watchlist.sqlite`
  - 本地 SQLite 数据文件随结构/数据同步更新。

## 3. 前端改动（apps/web）
### 3.1 页面主结构重构
- 文件：`apps/web/app/fund-dashboard.tsx`
- 从旧的分段滚动布局切换为 TopNav 驱动布局：
  - 顶部摘要栏 + 页签导航；
  - 视图切换为 `summary | funds | portfolio`。
- 新增页签拖拽排序逻辑（基于 dnd-kit），并接入后端持久化：
  - 首次加载 `fetchPortfolioTabLayout()`；
  - 拖拽后 `updatePortfolioTabLayout()` 与 `reorderPortfolios()` 并发提交；
  - 失败回滚 UI 状态。
- 新增首屏全局 Loading 蒙层（仅首轮加载生效），并统一加载文案颜色为项目蓝色。
- 登录校验态提示改为 `Spin.description`。

### 3.2 API 客户端扩展
- 文件：`apps/web/lib/api.ts`
- 新增接口：
  - `fetchPortfolioTabLayout()`
  - `updatePortfolioTabLayout(fundsTabIndex)`

### 3.3 新增组件（未跟踪文件）
- `apps/web/components/dashboard/layout/top-nav-layout.tsx`
  - 顶部品牌区、用户操作区、可拖拽页签区、资产摘要条。
- `apps/web/components/dashboard/navigation/draggable-tab-list.tsx`
  - 固定页签 + 可拖拽页签混排，支持移动端横向滚动。
- `apps/web/components/dashboard/views/account-summary-view.tsx`
  - 账户汇总网格视图，空态“暂无组合，请先创建”居中展示。
- `apps/web/components/dashboard/views/portfolio-detail-view.tsx`
  - 单组合详情视图，整合决策摘要、达成情况、持仓表格与历史弹窗。
- `apps/web/components/dashboard/cards/portfolio-summary-card.tsx`
  - 组合摘要卡片（资产、持有收益、当日收益）。
- `apps/web/components/dashboard/cards/decision-card.tsx`
  - 决策动作卡片（标签、置信度、引用来源等）。
- `apps/web/components/dashboard/cards/plan-completion-card.tsx`
  - 比例计划达成卡片（计划/实际/超配进度）。

### 3.4 业务组件与弹窗优化
- `flat-add-fund-dialog.tsx`
  - 新增 `initialPortfolioId` 入参，打开时自动回填目标组合；
  - `destroyOnClose` -> `destroyOnHidden`；弹窗居中。
- `portfolio-add-fund-dialog.tsx`、`create-portfolio-dialog.tsx`、`update-fund-dialog.tsx`、`decision-history-dialog.tsx`
  - 弹窗统一 `centered`；部分内部文案与控件新 API 适配。

### 3.5 表格与列表体验优化
- `features/funds/flat-funds-table.tsx`
  - 增加客户端列排序（金额/涨跌/估算）；
  - 去除旧排序按钮，改由表头排序；
  - 移动端 `List` 改为 `Flex + Card` 渲染（规避 antd List 弃用）；
  - `Space.direction` 迁移为 `Space.orientation`。
- `features/portfolios/portfolio-funds-table.tsx`
  - 移动端收窄列宽与横向滚动阈值；
  - 拖拽列仅在非移动端显示；
  - 比例列按组合类型条件渲染；
  - `bodyStyle` 迁移为 `styles.body`。
- `features/analytics/estimate-analysis-panel.tsx`
  - `List` 改为 `Flex` 列表渲染，保留原信息结构。

## 4. 样式与 UI 细节
- 文件：`apps/web/app/globals.css`
- 新增 `.scrollbar-hide` 工具类（含 WebKit 与 Firefox/IE 兼容处理），用于移动端横向滚动容器。

## 5. Ant Design 弃用 API 迁移清单
1. `Spin`：`tip` -> `description`。
2. `Card`：`bordered={false}` -> `variant="borderless"`。
3. `Space`：`direction` -> `orientation`。
4. `List`：业务代码中移除 `antd List` 使用，改为 `Flex + map` 渲染。

## 6. 其他变更
1. `apps/web/tsconfig.tsbuildinfo`：TypeScript 增量编译产物更新。
2. 本次改动涉及 tracked + untracked 文件并行演进，已统一纳入本汇总。

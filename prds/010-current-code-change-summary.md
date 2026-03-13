# 010 当前代码变更汇总（2026-03-13）

## 1. 变更范围概览
1. 后端新增「组合分享码」能力：支持生成分享快照、密码保护、有效期控制、按分享码导入。
2. 数据层升级为 `schema_version=3`，为组合增加固定 `share_code`，并新增分享记录表。
3. 可选接入 Redis 作为分享快照缓存，不可用时自动降级 SQLite。
4. 决策 AI 请求补充网络瞬时错误重试机制，降低外部网络抖动导致的失败率。
5. 前端仪表盘接入「分享组合 / 导入组合」完整交互链路。

## 2. 后端改动（apps/api）
### 2.1 配置与依赖
- 文件：`apps/api/.env.example`
  - 新增 Redis 配置项：`REDIS_ENABLED`、`REDIS_URL`、`REDIS_KEY_PREFIX`、`REDIS_CONNECT_TIMEOUT_MS`。
- 文件：`apps/api/package.json`
  - 新增依赖：`redis@^5.9.0`。
- 文件：`apps/api/src/config.ts`
  - 新增 `config.redis` 配置结构，支持自动推导启用状态（显式开关或存在 `REDIS_URL`）。

### 2.2 应用装配
- 文件：`apps/api/src/app.ts`
  - 新增 `createShareCache` + `ShareService` 初始化与注入。
  - `registerWatchlistRoutes` 增加 `shareService` 依赖。

### 2.3 存储层与迁移
- 文件：`apps/api/src/infra/watchlist/sqlite-watchlist-store.ts`
  - `PortfolioItem` 新增 `shareCode` 字段。
  - `ExportDataPayload` 的 portfolio 项新增 `shareCode`，导出版本从 `1` 升级到 `2`。
  - 新增 `PortfolioShareRecord` 与存储接口方法：
    - `getActivePortfolioShareByCode(shareCode)`
    - `replaceActivePortfolioShare(input)`
  - 数据库迁移要点：
    - `user_portfolio` 新增 `share_code` 列与唯一索引；
    - 新建 `user_portfolio_share` 表记录分享快照与状态；
    - 启动时对历史组合执行 `share_code` 回填；
    - 旧表迁移、导入导出、创建组合流程均接入 `share_code`。
  - 新增 8 位大写字母数字分享码生成逻辑及唯一性检测。

### 2.4 分享模块（新增）
- 文件：`apps/api/src/modules/share/service.ts`（新增）
  - 提供 `createShare`：
    - 基于组合当前基金快照生成分享记录；
    - 支持 `SEVEN_DAYS / PERMANENT` 有效期；
    - 支持 6 位数字可选密码（哈希存储）。
  - 提供 `importByShareCode`：
    - 校验分享可用性、过期状态与密码；
    - 按快照创建新组合并导入基金（持仓金额归零，比例组合保留 `plannedRatio`）；
    - 自动处理导入命名冲突（`(导入) / (导入2)...`）。
- 文件：`apps/api/src/modules/share/cache.ts`（新增）
  - 可选 Redis 缓存实现，支持 TTL 与异常自动降级。

### 2.5 路由扩展
- 文件：`apps/api/src/routes/watchlist.ts`
  - 新增参数解析：
    - `parseShareValidity`
    - `parseOptionalSharePassword`（6 位数字）
    - `parseShareCode`（8 位字母数字，自动大写）
  - 新增接口：
    - `POST /v1/portfolios/:portfolioId/share`
    - `POST /v1/portfolios/import-by-share-code`

### 2.6 决策模块健壮性增强
- 文件：`apps/api/src/modules/decision/openai-provider.ts`
  - 新增 `fetchWithRetry`，对瞬时网络错误进行最多 2 次请求尝试。
  - `responses`、`chat/completions`、纯文本 fallback 全部接入重试。
- 文件：`apps/api/src/modules/decision/__tests__/openai-provider.test.ts`
  - 新增网络失败后重试成功的用例。

### 2.7 测试补充
- 文件：`apps/api/src/routes/__tests__/watchlist-routes.test.ts`
  - 新增分享与导入相关集成测试：
    - 缺少 `share_code` 列时的历史数据迁移；
    - 组合创建时生成固定分享码；
    - 密码分享与按码导入（含错误密码/缺密码）；
    - 分享快照不可变导入与同名自动后缀；
    - 过期分享返回不可用。
- 文件：`apps/api/src/routes/__tests__/decision-routes.test.ts`
  - 测试应用装配补充 `ShareService` 注入。

## 3. 前端改动（apps/web）
### 3.1 仪表盘主流程接入分享/导入
- 文件：`apps/web/app/fund-dashboard.tsx`
  - 新增 `ImportPortfolioDialog` 与 `SharePortfolioDialog` 的状态管理和渲染。
  - 顶部导航新增「导入组合」入口。
  - 组合详情视图新增「分享组合」入口。
  - 导入成功后自动切换到新导入组合页签。

### 3.2 交互组件调整
- 文件：`apps/web/components/dashboard/layout/top-nav-layout.tsx`
  - 新增导入按钮（桌面端与移动端均支持）。
- 文件：`apps/web/components/dashboard/views/portfolio-detail-view.tsx`
  - 透传 `onOpenShareDialog`。
- 文件：`apps/web/components/dashboard/features/portfolios/portfolio-funds-table.tsx`
  - 新增「分享组合」按钮；
  - 头部文案与 header padding 微调。

### 3.3 新增弹窗（新增文件）
- 文件：`apps/web/components/dashboard/dialogs/import-portfolio-dialog.tsx`（新增）
  - 输入分享码与可选密码，前端规则校验格式后提交。
- 文件：`apps/web/components/dashboard/dialogs/share-portfolio-dialog.tsx`（新增）
  - 设置有效期与可选密码，生成后展示分享码并支持复制。

### 3.4 前端 API 与动作层
- 文件：`apps/web/lib/api.ts`
  - 新增：
    - `sharePortfolio(...)`
    - `importPortfolioByShareCode(...)`
- 文件：`apps/web/hooks/use-portfolio-actions.ts`
  - 新增：
    - `sharePortfolioAction(...)`
    - `importPortfolioByShareCodeAction(...)`
  - 接入 loading/status/error 流程与导入后刷新逻辑。

## 4. 共享协议层改动（packages/shared）
- 文件：`packages/shared/src/constants.ts`
  - 新增错误码：
    - `SHARE_NOT_AVAILABLE`
    - `SHARE_PASSWORD_REQUIRED`
    - `SHARE_PASSWORD_INVALID`
- 文件：`packages/shared/src/types.ts`
  - 新增类型：
    - `PortfolioShareValidity`
    - `PortfolioShareResult`
    - `ImportPortfolioByShareCodeResult`

## 5. 数据文件变更
- 文件：`apps/api/data/watchlist.sqlite`
  - 本地 SQLite 数据文件已随分享相关结构/数据变更更新（binary diff）。

## 6. 本次纳入的改动文件
- 修改：
  - `apps/api/.env.example`
  - `apps/api/data/watchlist.sqlite`
  - `apps/api/package.json`
  - `apps/api/src/app.ts`
  - `apps/api/src/config.ts`
  - `apps/api/src/infra/watchlist/sqlite-watchlist-store.ts`
  - `apps/api/src/modules/decision/__tests__/openai-provider.test.ts`
  - `apps/api/src/modules/decision/openai-provider.ts`
  - `apps/api/src/routes/__tests__/decision-routes.test.ts`
  - `apps/api/src/routes/__tests__/watchlist-routes.test.ts`
  - `apps/api/src/routes/watchlist.ts`
  - `apps/web/app/fund-dashboard.tsx`
  - `apps/web/components/dashboard/features/portfolios/portfolio-funds-table.tsx`
  - `apps/web/components/dashboard/layout/top-nav-layout.tsx`
  - `apps/web/components/dashboard/views/portfolio-detail-view.tsx`
  - `apps/web/hooks/use-portfolio-actions.ts`
  - `apps/web/lib/api.ts`
  - `packages/shared/src/constants.ts`
  - `packages/shared/src/types.ts`
- 新增：
  - `apps/api/src/modules/share/cache.ts`
  - `apps/api/src/modules/share/service.ts`
  - `apps/web/components/dashboard/dialogs/import-portfolio-dialog.tsx`
  - `apps/web/components/dashboard/dialogs/share-portfolio-dialog.tsx`

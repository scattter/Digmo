# Digmo

Digmo 是一个围绕场外基金盘中估值的多端系统 MVP，优先交付估值任务模块与只读 API，再由 Web 与微信小程序复用同一套数据契约。

## 目录

- `apps/api`: Fastify API + 估值任务调度
- `apps/web`: Next.js Web MVP（估值查询）
- `apps/mini`: Taro 微信小程序 MVP（估值查询）
- `packages/shared`: 公共类型、错误码、常量
- `prds`: 产品与工程规划文档

## 快速开始

1. 安装依赖：`pnpm install`
2. 启动 API：`pnpm --filter @digmo/api dev`
3. 启动 Web：`pnpm --filter @digmo/web dev`
4. 启动小程序开发：`pnpm --filter @digmo/mini dev:weapp`

## 说明

- 默认时区：`Asia/Shanghai`
- 估值是盘中估算值，不等同基金公司官方净值
- MVP 数据层优先 MCP 聚合，生产建议替换为持牌/商业数据源

## GitHub 镜像 CI

- 工作流文件：`.github/workflows/api-image.yml`
- 触发条件：`push` 到 `master`（且涉及 `apps/api` / `apps/web` / `packages/shared` / 关键构建文件）或手动触发
- 镜像仓库：
  - `ghcr.io/<github_owner>/digmo-api`
  - `ghcr.io/<github_owner>/digmo-web`
- 标签策略：分支名、Tag、`sha-<commit>`，默认分支额外推送 `latest`

首次使用前请确认仓库 `Actions` 已启用，且工作流权限允许 `Read and write`（用于向 GHCR 推送镜像）。

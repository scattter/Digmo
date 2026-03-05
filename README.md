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
